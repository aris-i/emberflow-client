import {firebase, FirebaseDatabaseTypes} from "@react-native-firebase/database";
import {FormData, FormStatus, FormStatusHandler} from "./types";

let db: FirebaseDatabaseTypes.Module;
let _uid: string;
let _statusMap: Record<FormStatus, string>;
let DEFAULT_TIMEOUT = 60000;

export function initClient(
    rtdbUrl: string,
    uid: string,
    statusMap?: Record<FormStatus, string>,
    defaultTimeout?: number
) {
    DEFAULT_TIMEOUT = defaultTimeout || DEFAULT_TIMEOUT;
    db = firebase
        .app()
        .database(rtdbUrl);
    _uid = uid;

    if (statusMap) {
        _statusMap = statusMap;
    }
}

export const submitCancellableForm = async (
    formData: FormData,
    statusHandler?: FormStatusHandler,
    timeout?: number
) => {
    const submittedAt = new Date();

    function isTerminalState(status: FormStatus) {
        return status === getStatusValue("finished")
            || status === getStatusValue("cancelled")
            || status === getStatusValue("validation-error")
            || status === getStatusValue("security-error")
            || status === getStatusValue("error");
    }

    function startTimeoutMonitor() {
        return setTimeout(async () => {
            if (isLastUpdate) {
                return;
            }

            formRef.off('value', onValueChange);

            const snapshot = await formRef.once('value');

            const formData = snapshot.val();

            let newStatus = formData["@status"];

            isLastUpdate = true;

            if (statusHandler) {
                if (isTerminalState(newStatus)) {
                    statusHandler(newStatus, {
                        ...formData,
                        submittedAt,
                        "@status": newStatus,
                    }, isLastUpdate);
                } else {
                    newStatus = getStatusValue("error");
                    statusHandler(newStatus, {
                        ...formData,
                        submittedAt,
                        "@status": newStatus,
                        "@messages": "timeout waiting for last status update"
                    }, isLastUpdate);
                }
            }
        }, timeout || DEFAULT_TIMEOUT);
    }

    const formRef = db.ref(`forms/${_uid}`).push();
    await formRef.set({
        "@status": getStatusValue("submit"),
        formData: JSON.stringify(formData),
        submittedAt: firebase.database.ServerValue.TIMESTAMP
    });

    let currentStatus = getStatusValue("submit");

    let isLastUpdate = false;

    const onValueChange = async (snapshot: FirebaseDatabaseTypes.DataSnapshot) => {
        const {"@status": newStatus} = snapshot.val();

        if (isTerminalState(newStatus)) {
            isLastUpdate = true;
            formRef.off('value', onValueChange);
        }

        let messages;

        if (newStatus === getStatusValue("validation-error")
            || newStatus === getStatusValue("security-error")
            || newStatus === getStatusValue("error")
            || newStatus === getStatusValue("cancelled")
        ) {
            const data = await formRef.once('value');
            const currData = data.val();
            if (currData["@messages"]) {
                messages = currData["@messages"];
            }
        }

        if (statusHandler) {
            if (isLastUpdate) {
                clearTimeout(timeoutId);
            }
            statusHandler(
                newStatus,
                {...formData, submittedAt, "@status": newStatus, ...(messages ? {"@messages": messages} : {})},
                isLastUpdate
            );
        }
        currentStatus = newStatus;
    };

    formRef.on('value', onValueChange);

    const timeoutId = startTimeoutMonitor();

    return {
        cancel: async () => {
            const delay = formData["@delay"];
            if (delay) {
                if (currentStatus === getStatusValue("delay")) {
                    console.log("Cancelling form");
                    await formRef.update({"@status": getStatusValue("cancel")});
                    return true;
                } else {
                    console.log("Delay has elapsed. Can't cancel the form");
                    return false;
                }
            } else {
                console.log("Can only cancel the form with a delay");
                return false;
            }
        },
        unsubscribe: () => {
            formRef.off('value', onValueChange);
        }
    }
}

export function submitForm(formData: FormData) {
    return new Promise<FormData>((resolve) => {
        submitCancellableForm(
            formData,
            (status, data, isLastUpdate) => {
                if (isLastUpdate) {
                    resolve(data);
                }
            }
        );
    });
}

export function getStatusValue(statusKey: FormStatus): string {
    return _statusMap ? (_statusMap[statusKey] || statusKey) : statusKey;
}
