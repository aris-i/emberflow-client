import {FormData, FormStatus, FormStatusHandler} from "./types";
import {getDatabase, Database, push, ref, set, onChildChanged, off, update, get} from "firebase/database";
import {FirebaseApp} from "firebase/app";

let db: Database;
let statusMap: Record<FormStatus, string>;

export function initClient(
    app: FirebaseApp,
    url?: string,
    _statusMap?: Record<FormStatus, string>,
) {
    db = getDatabase(app, url);
    if (_statusMap) {
        statusMap = _statusMap;
    }
}

export async function submitForm(
    formData: FormData,
    statusHandler: FormStatusHandler
) {
    // get the second element and last element from docPath split by "/"
    const userId = formData["@docPath"].split("/")[1];
    const formRef = push(ref(db, `forms/${userId}`));
    await set(formRef, {
        "@status": getStatusValue("submit"),
        formData: JSON.stringify(formData),
    });
    let currentStatus = getStatusValue("submit");
    const onValueChange = onChildChanged(formRef, async (snapshot) => {
        const changedVal = snapshot.val();
        const changedKey = snapshot.key;
        if (!changedKey) {
            return;
        }

        if (changedKey !== "@status") {
            return;
        }

        const newStatus = changedVal as FormStatus;
        let isLastUpdate = false;
        if (newStatus === getStatusValue("finished") || newStatus === getStatusValue("cancelled")
            || newStatus === getStatusValue("validation-error")
            || newStatus === getStatusValue("security-error")
            || newStatus === getStatusValue("error")) {
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

    return {
        cancel: async () => {
            const delay = formData["@delay"];
            if (delay) {
                if (currentStatus === getStatusValue("delay")) {
                    console.log("Cancelling form");
                    await update(formRef, {"@status": getStatusValue("cancel")});
                    return true;
                } else {
                    console.log("Delay has elapsed.  Can't cancel form");
                    return false;
                }
            } else {
                console.log("Can only cancel form with delay");
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
