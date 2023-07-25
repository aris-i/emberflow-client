import {firebase, FirebaseDatabaseTypes} from "@react-native-firebase/database";
import {FormData, FormStatus, FormStatusHandler} from "./types";
import auth from '@react-native-firebase/auth';
export * from "./types";

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
    const splits = docPath.split("/");
    const userId = splits[1];
    const docId = splits[splits.length - 1];
    // get current logged in user id
    const currentUser = auth().currentUser;
    if (!currentUser) {
        throw new Error("No current logged in user");
    }
    const currentUserId = currentUser.uid;
    if (currentUserId !== userId) {
        throw new Error("Logged in user id does not match docPath user id");
    }

    let formRef = db.ref(`forms/${docId}`);
    await formRef.set(formData);

    let currentStatus = formData["@status"];
    let currentFormData = formData;
    const onValueChange = formRef
        .on('value', snapshot => {
            currentFormData = snapshot.val();
            const newStatus = currentFormData["@status"] as FormStatus;
            console.log('new status: ', newStatus);
            if (newStatus !== currentStatus) {
                statusHandler(newStatus, currentFormData);
                if (newStatus === "finished" || newStatus === "cancelled"
                    || newStatus === "validation-error" || newStatus === "security-error" ) {
                    formRef.off('value', onValueChange);
                }
                currentStatus = newStatus;
            }
        });
    return {
        cancel: async () => {
            const delay = currentFormData["@delay"];
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
        }
    }
}
