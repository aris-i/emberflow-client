import {FormData, FormStatus, FormStatusHandler} from "./types";
import {
    Database, get, getDatabase, off, onChildChanged, push,
    ref, serverTimestamp, set, update, DataSnapshot,
} from "firebase/database";
import {FirebaseApp} from "firebase/app";

let db: Database;
let _uid: string;
let _statusMap: Record<FormStatus, string>;
let DEFAULT_TIMEOUT = 60000;

export function initClient(
    app: FirebaseApp,
    uid: string,
    url?: string,
    statusMap?: Record<FormStatus, string>,
    defaultTimeout?: number
) {
    DEFAULT_TIMEOUT = defaultTimeout || DEFAULT_TIMEOUT;
    db = getDatabase(app, url);
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
        setTimeout(async () => {
            if (isLastUpdate) {
                return;
            }

            off(formRef, 'child_changed', onValueChange);

            const snapshot = await get(formRef);
            const form = snapshot.val();

            let newStatus = form["@status"];
            isLastUpdate = true;

            if (statusHandler) {
                if (isTerminalState(newStatus)) {
                    statusHandler(newStatus, {
                        ...form,
                        submittedAt,
                        "@status": newStatus,
                    }, isLastUpdate);
                } else {
                    newStatus = getStatusValue("error");
                    statusHandler(newStatus, {
                        ...form,
                        submittedAt,
                        "@status": newStatus,
                        "@messages": "timeout waiting for last status update"
                    }, isLastUpdate);
                }
            }
        }, timeout || DEFAULT_TIMEOUT);
    }

    const formRef = push(ref(db, `forms/${_uid}`));
    await set(formRef, {
        "@status": getStatusValue("submit"),
        formData: JSON.stringify(formData),
        submittedAt: serverTimestamp(),
    });

    let currentStatus = getStatusValue("submit");
    let isLastUpdate = false;

    const onValueChange = async (snapshot: DataSnapshot) => {
        const changedVal = snapshot.val();
        const changedKey = snapshot.key;

        if (!changedKey || changedKey !== "@status") {
            return;
        }

        const newStatus = changedVal as FormStatus;
        let isLastUpdate = false;

        // Check if the new status is a "terminal state" (e.g., finished, canceled, or an error)
        if (isTerminalState(newStatus)) {
            isLastUpdate = true;
            off(formRef, 'child_changed', onValueChange);
        }

        let messages;
        if (newStatus === getStatusValue("validation-error")
            || newStatus === getStatusValue("security-error")
            || newStatus === getStatusValue("error")
            || newStatus === getStatusValue("cancelled")
        ) {
            const currData = await get(formRef);
            if (currData.exists()) {
                const currFormData = currData.val();
                if (currFormData["@messages"]) {
                    messages = currFormData["@messages"];
                }
            }
        }

        if (statusHandler) {
            statusHandler(
                newStatus,
                {...formData, submittedAt, "@status": newStatus, ...(messages ? {"@messages": messages} : {})},
                isLastUpdate
            );
        }
        currentStatus = newStatus;
    };

    onChildChanged(formRef, onValueChange);

    startTimeoutMonitor();

    return {
        cancel: async () => {
            const delay = formData["@delay"];
            if (delay) {
                if (currentStatus === getStatusValue("delay")) {
                    console.log("Cancelling form");
                    await update(formRef, {"@status": getStatusValue("cancel")});
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
            off(formRef, 'child_changed', onValueChange);
        }
    }
}

export function submitForm(formData: FormData) {
    return new Promise<FormData>((resolve) => {
        submitCancellableForm(
            formData,
            (status, formData, isLastUpdate) => {
                if (isLastUpdate) {
                    resolve(formData);
                }
            }
        );
    });
}

export function getStatusValue(statusKey: FormStatus): string {
    return _statusMap ? (_statusMap[statusKey] || statusKey) : statusKey;
}
