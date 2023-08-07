import {firebase, FirebaseDatabaseTypes} from "@react-native-firebase/database";
import {FormData, FormStatus, FormStatusHandler} from "./types";

let db: FirebaseDatabaseTypes.Module;

export function initClient(databaseName: string, region: string) {
    db = firebase
        .app()
        .database(`https://${databaseName}.${region}.firebasedatabase.app/`);

}
export async function submitForm(
    docPath: string,
    formData: FormData,
    statusHandler: FormStatusHandler
) {
    // get the second element and last element from docPath split by "/"
    const userId = docPath.split("/")[1];

    const formRef = db.ref(`forms/${userId}`).push();
    await formRef.set({...formData, "@docPath": docPath, "@status": "submit"});
    let currentStatus = "submit";
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
            if (newStatus === "finished" || newStatus === "cancelled"
                || newStatus === "validation-error" || newStatus === "security-error"
                || newStatus === "error") {
                isLastUpdate = true;
                formRef.off('child_changed', onValueChange);
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
                    await formRef.update({"@status": "cancel"});
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
