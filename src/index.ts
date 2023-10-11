import {firebase, FirebaseDatabaseTypes} from "@react-native-firebase/database";
import {FormData, FormStatus, FormStatusHandler} from "./types";

let db: FirebaseDatabaseTypes.Module;
let statusMap: Record<FormStatus, string>;
let DEFAULT_TIMEOUT = 60000;

export function initClient(
    databaseName: string,
    region: string,
    _statusMap?: Record<FormStatus, string>,
    defaultTimeout?: number
) {
    DEFAULT_TIMEOUT = defaultTimeout || DEFAULT_TIMEOUT;
    db = firebase
        .app()
        .database(`https://${databaseName}.${region}.firebasedatabase.app/`);
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
        // Set up a delayed action using setTimeout
        setTimeout(async () => {
            // Check if this function has already handled an update
            if (isLastUpdate) {
                return;
            }

            // Turn off the listener for changes in the form data
            formRef.off('child_changed', onValueChange);
            // Fetch a snapshot of the current form data
            const snapshot = await formRef.once('value');
            const formData = snapshot.val(); // Extract the data from the snapshot

            // Get the current status of the form
            let newStatus = formData["@status"];

            // Indicate that this is the last update this function will handle
            isLastUpdate = true;
            console.log("inside startTimeoutMonitor")
            console.log("isLastUpdate ", isLastUpdate)
            console.log("new status ", newStatus)
            // Check if the current status is a "terminal state" (e.g., finished, canceled, or an error)
            if (isTerminalState(newStatus)) {
                // If it's a terminal state, update the status and notify the handler
                statusHandler(newStatus, {
                    ...formData,
                    "@status": newStatus,
                }, isLastUpdate);
            } else {
                // If it's not a terminal state, consider it an error due to a timeout
                // Set a new error status and notify the handler with an error message
                newStatus = getStatusValue("error");
                statusHandler(newStatus, {
                    ...formData,
                    "@status": newStatus,
                    "@message": "timeout waiting for last status update"
                }, isLastUpdate);
            }
        }, timeout || DEFAULT_TIMEOUT);
    }

    // Create a reference to the user ID by extracting it from the '@docPath' property
    const userId = formData["@docPath"].split("/")[1];

    // Create a reference to a location in the Firebase database
    // The location is determined by the user ID, and '.push()' generates a unique key
    const formRef = db.ref(`forms/${userId}`).push();

    // Set initial data at this location, including '@status' as 'submit' and the form data as JSON
    await formRef.set({
        "@status": getStatusValue("submit"),
        formData: JSON.stringify(formData),
    });

    // Initialize variables to track the current status of the form and whether this function handled the last update
    let currentStatus = getStatusValue("submit");
    let isLastUpdate = false;

    // Set up a listener to detect changes in the form data, specifically in the '@status' property
    const onValueChange = formRef.on('child_changed', snapshot => {
        // This code will execute whenever the '@status' property changes
        const changedVal = snapshot.val(); // Get the new status value
        const changedKey = snapshot.key;   // Get the key that changed

        // Check if the key exists and if it's '@status'
        if (!changedKey || changedKey !== "@status") {
            return; // If not, do nothing and return
        }

        // Extract the new status value as a FormStatus
        const newStatus = changedVal as FormStatus;
        console.log("outside startTimeoutMonitor")
        console.log("isLastUpdate ", isLastUpdate)
        console.log("new status ", newStatus)
        // Check if the new status is a "terminal state" (e.g., finished, canceled, or an error)
        if (isTerminalState(newStatus)) {
            // If it's a terminal state, mark this as the last update and turn off the listener
            isLastUpdate = true;
            formRef.off('child_changed', onValueChange);
        }

        // Notify the status handler about the new status
        // Also, update the form data with the new status for the handler
        statusHandler(newStatus, {...formData, "@status": newStatus}, isLastUpdate);

        // Update the current status to the new status
        currentStatus = newStatus;

    });

    // Start the timeout monitor function to check for changes in the form's status
    startTimeoutMonitor();

    // Return an object with two functions: 'cancel' and 'unsubscribe'
    return {
        // 'cancel' function allows canceling the form submission under certain conditions
        cancel: async () => {
            const delay = formData["@delay"];
            if (delay) {
                // Check if there's a delay and if the current status is 'delay'
                if (currentStatus === getStatusValue("delay")) {
                    console.log("Cancelling form");
                    // Update the status to 'cancel' to cancel the form submission
                    await formRef.update({"@status": getStatusValue("cancel")});
                    return true; // Return 'true' to indicate successful cancellation
                } else {
                    console.log("Delay has elapsed. Can't cancel the form");
                    return false; // Return 'false' to indicate cancellation is not possible
                }
            } else {
                console.log("Can only cancel the form with a delay");
                return false; // Return 'false' to indicate cancellation is not possible
            }
        },
        // 'unsubscribe' function turns off the listener set up earlier
        unsubscribe: () => {
            formRef.off('child_changed', onValueChange);
        }
    }
}

export function getStatusValue(statusKey: FormStatus): string {
    return statusMap ? (statusMap[statusKey] || statusKey) : statusKey;
}
