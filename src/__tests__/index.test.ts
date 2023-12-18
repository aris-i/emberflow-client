import * as index from '../index';
import {initClient, submitCancellableForm, submitForm} from '../index';
import {FormData} from '../types';
import {get, off, onChildChanged, ref, set, update} from "firebase/database";
import {initializeApp} from "firebase/app";

let uid = 'testUserId';

// Mock the firebase database module
const formData: FormData = {
    "@actionType": "create",
    "@docPath": `topics/topicId`,
    "name": 'testName',
};

let statusTransition = ['submitted'];
let mockGetVal: any = {"@messages": {name: "Invalid"}};

let _callback: Function;
let _formData: FormData;

async function runCallback() {
    for (const status of statusTransition) {
        await _callback({
            val: jest.fn(() => (status)),
            key: "@status",
        });
    }
}

const onReturnMock = jest.fn();
const formRefMock = {
    key: 'testDocId',
};

const dbRefMock = jest.fn();
jest.mock('firebase/database', () => {
    return {
        __esModule: true,
        set: jest.fn((formData: any) => {
            _formData = formData;
        }),
        update: jest.fn(),
        onChildChanged: jest.fn((query: any, callback: Function) => {
            _callback = callback;
            return onReturnMock;
        }),
        push: jest.fn(() => {
            return onReturnMock;
        }),
        ref: jest.fn(() => {
            return onReturnMock;
        }),
        getDatabase: jest.fn((dbRef: any) => {
            dbRefMock(dbRef);
            return formRefMock;
        }),
        off: jest.fn(),
        get: jest.fn().mockResolvedValue({
                exists: jest.fn().mockReturnValue(true),
                val: jest.fn().mockImplementation(() => {
                    return mockGetVal
                }),
            }
        ),
    }
});

jest.mock('@firebase/app', () => ({
    __esModule: true,
    registerVersion: jest.fn(),
    initializeApp: jest.fn(),
}));

// Mock the auth module
const app = initializeApp({});

describe('submitCancellableForm', () => {
    beforeAll(() => {
        initClient(
            app,
            uid,
            'https://testDatabaseName.testRegion.firebasedatabase.app',
        );
    });

    it('should set form data and listen for status changes', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted', 'finished'];
        let submittedForm = await submitCancellableForm(formData, statusHandlerMock, 200);
        await runCallback();
        const submittedAt = new Date().getTime();

        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/${uid}`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(submittedForm).toBeDefined();
        expect(typeof submittedForm.cancel).toBe('function');
        expect(set).toHaveBeenCalledWith(onReturnMock,
            {formData: JSON.stringify({...formData, submittedAt}), "@status": "submit"});
        expect(onChildChanged).toHaveBeenCalledWith(onReturnMock, expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted',
            {...formData, submittedAt, "@status": "submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished',
            {...formData, submittedAt, "@status": "finished"}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", expect.any(Function));
    });

    it('cancel should return false if form has no @delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay'];
        let cancelForm = await submitCancellableForm({
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(true);
        expect(update).toHaveBeenCalledWith(onReturnMock, {"@status": "cancel"});

    });

    it('cancel should return false if form has @delay but status is already submitted', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay', 'submitted'];
        let cancelForm = await submitCancellableForm({
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
        expect(update).not.toHaveBeenCalledWith();
    });

    it('unsubscribe should turn off listening to status', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay', 'submitted'];
        let form = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        await form.unsubscribe();
        expect(off).toHaveBeenCalled();
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", onReturnMock);
    });

    it('validation-error status should pass @messages in statusHandlers', async () => {
        jest.clearAllMocks();
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'validation-error'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const submittedAt = new Date().getTime();

        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/${uid}`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(set).toHaveBeenCalledWith(
            onReturnMock,
            {formData: JSON.stringify({...formData, submittedAt}), "@status": "submit"}
        );
        expect(onChildChanged).toHaveBeenCalledWith(onReturnMock, expect.any(Function));
        expect(get).toHaveBeenCalledTimes(1);
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, submittedAt, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('validation-error',
            {...formData, submittedAt, "@status": "validation-error", "@messages": {name: "Invalid"}}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", expect.any(Function));
    });

    it('security-error status should pass @messages in statusHandlers', async () => {
        jest.clearAllMocks();
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'security-error'];
        await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const submittedAt = new Date().getTime();

        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/${uid}`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(set).toHaveBeenCalledWith(onReturnMock,
            {formData: JSON.stringify({...formData, submittedAt}), "@status": "submit"});
        expect(get).toHaveBeenCalledTimes(1);
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, submittedAt, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('security-error',
            {...formData, submittedAt, "@status": "security-error", "@messages": {"name": "Invalid"}}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, 'child_changed', expect.any(Function));
    });
});

describe('submitCancellableForm with timeout', () => {
    beforeAll(() => {
        initClient(
            app,
            uid,
            'https://testDatabaseName.testRegion.firebasedatabase.app',
        );
    });

    it("should return an error status and a message when submitCancellableForm reaches the timeout, and the status is not in a terminal state", async () => {
        jest.useFakeTimers();

        const timeout = 5000;
        statusTransition = ['submit', 'submitted', 'delay'];
        mockGetVal = {...formData, "@status": statusTransition[statusTransition.length - 1]};

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
        await runCallback();
        const submittedAt = new Date().getTime();

        expect(submittedForm).toBeDefined();
        expect(statusHandlerMock).toHaveBeenCalledWith('submit', {
            ...formData,
            submittedAt,
            "@status": 'submit',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted', {
            ...formData,
            submittedAt,
            "@status": 'submitted',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('delay', {
            ...formData,
            submittedAt,
            "@status": 'delay',
        }, false);

        await jest.advanceTimersByTime(timeout);

        expect(statusHandlerMock).toHaveBeenCalledTimes(4);
        expect(statusHandlerMock).toHaveBeenCalledWith('error', {
            ...formData,
            submittedAt,
            "@status": 'error',
            "@message": "timeout waiting for last status update",
        }, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", onReturnMock);
    })

    it("should not return an error status and a message when submitCancellableForm reaches the timeout, and the status is in a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted', 'finished'];
        mockGetVal = {...formData, "@status": statusTransition[statusTransition.length - 1]};
        const timeout = 1000;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
        await runCallback();
        const submittedAt = new Date().getTime();

        expect(submittedForm).toBeDefined();
        expect(statusHandlerMock).toHaveBeenCalledWith('submit', {
            ...formData,
            submittedAt,
            "@status": 'submit',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted', {
            ...formData,
            "@status": 'submitted',
            submittedAt,
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished', {
            ...formData,
            "@status": 'finished',
            submittedAt,
        }, true);

        await jest.advanceTimersByTime(timeout);
        expect(statusHandlerMock).toHaveBeenCalledTimes(4);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", onReturnMock);
    })

    it("should return a final update when submitCancellableForm reaches the timeout, and the status is in a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted'];
        mockGetVal = {...formData, "@status": 'finished'};
        const timeout = 1000;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
        await runCallback();
        const submittedAt = new Date().getTime();

        expect(submittedForm).toBeDefined();
        expect(statusHandlerMock).toHaveBeenCalledWith('submit', {
            ...formData,
            submittedAt,
            "@status": 'submit',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted', {
            ...formData,
            submittedAt,
            "@status": 'submitted',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);

        await jest.advanceTimersByTime(timeout);
        expect(statusHandlerMock).toHaveBeenCalledTimes(3);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished', {
            ...formData,
            submittedAt,
            "@status": 'finished',
        }, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", onReturnMock);
    })
})

describe('submitCancellableForm with custom status map', () => {
    beforeAll(() => {
        jest.clearAllMocks();
        initClient(
            app,
            uid,
            'https://testDatabaseName.testRegion.firebasedatabase.app',
            {
                "submit": "Submit",
                "delay": "Delay",
                "cancel": "Cancel",
                "submitted": "Submitted",
                "finished": "Finished",
                "cancelled": "Canceled",
                "error": "Error",
                "security-error": "SecurityError",
                "validation-error": "ValidationError",
            }
        );
    });

    it('should set form data and listen for status changes', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted', 'Finished'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const submittedAt = new Date().getTime();

        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/${uid}`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(set).toHaveBeenCalledWith(
            onReturnMock,
            {formData: JSON.stringify({...formData, submittedAt}), "@status": "Submit"}
        );
        expect(onChildChanged).toHaveBeenCalledWith(onReturnMock, expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('Submitted',
            {...formData, submittedAt, "@status": "Submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('Finished',
            {...formData, submittedAt, "@status": "Finished"}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", expect.any(Function));
    });

    it('cancel should return false if form has no @delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay'];
        let cancelForm = await submitCancellableForm({
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(true);
        expect(update).toHaveBeenCalledWith(onReturnMock, {"@status": "Cancel"});
    });

    it('cancel should return false if form has @delay but status is already submitted', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let cancelForm = await submitCancellableForm({
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
        expect(update).not.toHaveBeenCalledWith();
    });

    it('unsubscribe should turn off listening to status', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let form = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        await form.unsubscribe();
        expect(off).toHaveBeenCalled();
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", onReturnMock);
    });
});

let finalFormData = {"@status": "finished", ...formData};
describe('submitForm', () => {
    beforeAll(() => {
        initClient(app, uid, 'https://testDatabaseName.testRegion.firebasedatabase.app');
        jest.spyOn(index, 'submitCancellableForm').mockImplementation((formData, statusHandler) => {
            if (statusHandler) {
                statusHandler('finished', finalFormData, true);
            }
            return {
                cancel: jest.fn(),
                unsubscribe: jest.fn(),
            } as unknown as Promise<any>;
        });
    });

    it('should return formData with @status', async () => {
        const submittedForm = await submitForm(formData);

        expect(submittedForm).toEqual(finalFormData);
    });
});