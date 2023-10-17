import {FormData, FormStatus, FormStatusHandler} from "./types";
import {Database, getDatabase, off, onChildChanged, push, ref, set, update, get} from "firebase/database";
import {FirebaseApp} from "firebase/app";

let db: Database;
let statusMap: Record<FormStatus, string>;
let DEFAULT_TIMEOUT = 60000;

export function initClient(
    app: FirebaseApp,
    url?: string,
    _statusMap?: Record<FormStatus, string>,
    defaultTimeout?: number
) {
    DEFAULT_TIMEOUT = defaultTimeout || DEFAULT_TIMEOUT;
    db = getDatabase(app, url);
    if (_statusMap) {
        statusMap = _statusMap;
    }
}

export async function submitForm(
    formData: FormData,
    statusHandler: FormStatusHandler,
    timeout?: number
) {
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
            const formData = snapshot.val();

            let newStatus = formData["@status"];
            isLastUpdate = true;

            if (isTerminalState(newStatus)) {
                statusHandler(newStatus, {
                    ...formData,
                    "@status": newStatus,
                }, isLastUpdate);
            } else {
                newStatus = getStatusValue("error");
                statusHandler(newStatus, {
                    ...formData,
                    "@status": newStatus,
                    "@message": "timeout waiting for last status update"
                }, isLastUpdate);
            }
        }, timeout || DEFAULT_TIMEOUT);
    }

    const userId = formData["@docPath"].split("/")[1];
    const formRef = push(ref(db, `forms/${userId}`));
    await set(formRef, {
        "@status": getStatusValue("submit"),
        formData: JSON.stringify(formData),
    });

    let currentStatus = getStatusValue("submit");
    let isLastUpdate = false;

    const onValueChange = onChildChanged(formRef, async (snapshot) => {
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
        if(newStatus === getStatusValue("validation-error")
            || newStatus === getStatusValue("security-error")
            || newStatus === getStatusValue("error")
        ) {
            const currData = await get(formRef);
            if (currData.exists()) {
                const currFormData = currData.val();
                if(currFormData["@messages"]) {
                    messages = currFormData["@messages"];
                }
            }
        }

        statusHandler(
            newStatus,
            {...formData, "@status": newStatus, ...(messages ? {"@messages": messages} : {})},
            isLastUpdate
        );
        currentStatus = newStatus;
    });

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

export function getStatusValue(statusKey: FormStatus): string {
    return statusMap ? (statusMap[statusKey] || statusKey) : statusKey;
}
