import {FormData, FormStatus, FormStatusHandler} from "./types";
import * as admin from "firebase-admin";
import {database} from "firebase-admin";

let db: database.Database;
let statusMap: Record<FormStatus, string>;

export function initClient(fbAdmin: admin.app.App, _statusMap?: Record<FormStatus, string>) {
    db = fbAdmin.database();
    if(_statusMap){
        statusMap = _statusMap;
    }
}
export async function submitForm(
    formData: FormData,
    statusHandler: FormStatusHandler
) {
    // get the second element and last element from docPath split by "/"
    const userId = formData["@docPath"].split("/")[1];

    const formRef = db.ref(`forms/${userId}`).push();
    await formRef.set({
        "@status": getStatusValue("submit"),
        formData: JSON.stringify(formData),
    });
    let currentStatus = getStatusValue("submit");
    const onValueChange = formRef
        .on('child_changed', snapshot => {
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
                formRef.off('child_changed', onValueChange);
            }

            statusHandler(newStatus, {...formData, "@status": newStatus}, isLastUpdate);
            currentStatus = newStatus;
        });

    return {
        cancel: async () => {
            const delay = formData["@delay"];
            if (delay){
                if (currentStatus === getStatusValue("delay")) {
                    console.log("Cancelling form");
                    await formRef.update({"@status": getStatusValue("cancel")});
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
            formRef.off('child_changed', onValueChange);
        }
    }
}

export function getStatusValue(statusKey: FormStatus): string {
    return statusMap ? (statusMap[statusKey] || statusKey) : statusKey;
}
