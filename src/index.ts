import {FormData, FormStatus, FormStatusHandler} from "./types";
import {getDatabase, Database, push, ref, set, onChildChanged, off, update} from "firebase/database";
import {FirebaseApp} from "@firebase/app";

let db: Database;
export function initClient(app: FirebaseApp) {
    db = getDatabase(app);
}
export async function submitForm(
    docPath: string,
    formData: FormData,
    statusHandler: FormStatusHandler
) {
    // get the second element and last element from docPath split by "/"
    const userId = docPath.split("/")[1];
    const formRef = push(ref(db, `forms/${userId}`));
    await set(ref(db, docPath), {...formData, "@status": "submit", "@docPath": docPath});
    let currentStatus = "submit";
    const onValueChange = onChildChanged(formRef, (snapshot) => {
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
        if (newStatus === "finished" || newStatus === "cancelled"
            || newStatus === "validation-error" || newStatus === "security-error"
            || newStatus === "error") {
            isLastUpdate = true;
            off(formRef, 'child_changed', onValueChange);
        }

        statusHandler(newStatus, {...formData, "@status": newStatus, "@docPath": docPath}, isLastUpdate);
        currentStatus = newStatus;
    });

    return {
        cancel: async () => {
            const delay = formData["@delay"];
            if (delay){
                if (currentStatus === "delay") {
                    console.log("Cancelling form");
                    await update(formRef, {"@status": "cancel"});
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
