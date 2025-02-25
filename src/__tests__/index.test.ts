import * as index from '../index';
import {initClient, submitCancellableForm, submitForm} from '../index';
import {FormData} from '../types';
import * as admin from "firebase-admin";

let uid = 'testUserId';

// Mock the firebase database module
const formData: FormData = {
    "@actionType": "create",
    "@docPath": `topics/topicId`,
    "name": 'testName',
};

let statusTransition = ['submitted'];
let _callback: Function;
let _formData: FormData;

async function runCallback() {
    for (let i = 0; i < statusTransition.length; i++) {
        await _callback({
            val: jest.fn(() => (statusTransition[i])),
            key: "@status",
        });
    }
}

const onceValMock = jest.fn();
const formRefMock = {
    key: 'testDocId',
    set: jest.fn((formData: any) => {
        _formData = formData;
    }),
    push: jest.fn().mockReturnThis(),
    on: jest.fn((eventType: string, callback: Function) => {
        _callback = callback;
    }),
    off: jest.fn(),
    update: jest.fn(),
    once: jest.fn().mockReturnValue({val: onceValMock}),
    ref: jest.fn().mockReturnThis(),
};

const dbRefMock = jest.fn();
jest.mock('firebase-admin', () => {
    const originalModule = jest.requireActual('firebase-admin');

    return {
        ...originalModule,
        __esModule: true,
        initializeApp: jest.fn(() => ({
            database: jest.fn(() => {
                return formRefMock;
            }),
        })),
        firestore: {...originalModule.firestore}
    }
});

let currentTimestampInMilliseconds = Date.now();
const _seconds = Math.floor(currentTimestampInMilliseconds / 1000);
const _nanoseconds = (currentTimestampInMilliseconds % 1000) * 1e6;

const adminInstance = admin.initializeApp();

describe('submitCancellableForm', () => {
    beforeAll(() => {
        initClient(adminInstance, uid);
    });
    it('should set form data and listen for status changes', async () => {
        // dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted', 'finished'];
        let submittedForm = await submitCancellableForm(formData, statusHandlerMock, undefined, 200);
        await runCallback();
        const submittedAt = new Date();

        expect(formRefMock.ref).toHaveBeenCalledWith(`forms/${uid}`);
        expect(formRefMock.ref).toHaveBeenCalledTimes(1);
        expect(submittedForm).toBeDefined();
        expect(typeof submittedForm.cancel).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), submittedAt: {_nanoseconds, _seconds}, "@status": "submit"});
        expect(formRefMock.on).toHaveBeenCalledWith('child_changed', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted',
            {...formData, submittedAt, "@status": "submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished',
            {...formData, submittedAt, "@status": "finished"}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
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
        expect(formRefMock.update).toHaveBeenCalledWith({"@status": "cancel"});

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
        expect(formRefMock.update).not.toHaveBeenCalledWith();
    });

    it('unsubscribe should turn off listening to status', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay', 'submitted'];
        let form = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        await form.unsubscribe();
        expect(formRefMock.off).toHaveBeenCalled();
        expect(formRefMock.off).toHaveBeenCalledWith("child_changed", _callback);
    });

    it('validation-error status should pass @messages in statusHandlers', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'validation-error'];
        onceValMock.mockReturnValue({...formData, "@messages": {"name": "Invalid"}});
        await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const submittedAt = new Date();

        expect(formRefMock.ref).toHaveBeenCalledWith(`forms/${uid}`);
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), submittedAt: {_nanoseconds, _seconds}, "@status": "submit"});
        expect(formRefMock.once).toHaveBeenCalledWith('value');
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, submittedAt, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('validation-error',
            {...formData, submittedAt, "@status": "validation-error", "@messages": {"name": "Invalid"}}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    });

    it('security-error status should pass @messages in statusHandlers', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'security-error'];
        onceValMock.mockReturnValue({...formData, "@messages": {"name": "Invalid"}});
        await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const submittedAt = new Date();

        expect(formRefMock.ref).toHaveBeenCalledWith(`forms/${uid}`);
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), submittedAt: {_nanoseconds, _seconds}, "@status": "submit"});
        expect(formRefMock.on).toHaveBeenCalledWith('child_changed', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, submittedAt, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('security-error',
            {...formData, submittedAt, "@status": "security-error", "@messages": {"name": "Invalid"}}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    });
});

describe('submitCancellableForm with timeout', () => {
    beforeAll(() => {
        initClient(adminInstance, uid);
    });

    it("should return an error status and a message when submitCancellableForm reaches the timeout, and the status is not in a terminal state", async () => {
        jest.useFakeTimers();
        const timeout = 5000;
        statusTransition = ['submit', 'submitted', 'delay'];
        onceValMock.mockReturnValue({...formData, "@status": statusTransition[statusTransition.length - 1]});

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, undefined, timeout);
        await runCallback();
        const submittedAt = new Date();

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
            "@messages": "timeout waiting for last status update",
        }, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    })

    it("should not return an error status and a message when submitCancellableForm reaches the timeout, and the status is in a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted', 'finished'];
        onceValMock.mockReturnValue({...formData, "@status": statusTransition[statusTransition.length - 1]});
        const timeout = 1000;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, undefined, timeout);
        await runCallback();
        const submittedAt = new Date();

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

        expect(statusHandlerMock).toHaveBeenCalledWith('finished', {
            ...formData,
            submittedAt,
            "@status": 'finished',
        }, true);

        await jest.advanceTimersByTime(timeout);
        expect(statusHandlerMock).toHaveBeenCalledTimes(3);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    })

    it("should return a final update when submitCancellableForm reaches the timeout, and the status is in a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted'];
        onceValMock.mockReturnValue({...formData, "@status": "finished"});
        const timeout = 1000;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, undefined, timeout);
        await runCallback();
        const submittedAt = new Date();

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
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    })
})

describe('submitCancellableForm with custom status map', () => {
    beforeAll(() => {
        jest.clearAllMocks();
        initClient(
            adminInstance,
            uid,
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
        const currentTimestampInMilliseconds = Date.now();
        const _seconds = Math.floor(currentTimestampInMilliseconds / 1000);
        const _nanoseconds = (currentTimestampInMilliseconds % 1000) * 1e6;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted', 'Finished'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        const submittedAt = new Date();

        expect(formRefMock.ref).toHaveBeenCalledWith(`forms/${uid}`);
        expect(formRefMock.ref).toHaveBeenCalledTimes(1);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), submittedAt: {_nanoseconds, _seconds}, "@status": "Submit"}
        );
        expect(formRefMock.on).toHaveBeenCalledWith('child_changed', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('Submitted',
            {...formData, submittedAt, "@status": "Submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('Finished',
            {...formData, submittedAt, "@status": "Finished"}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
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
        expect(formRefMock.update).toHaveBeenCalledWith({"@status": "Cancel"});

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
        expect(formRefMock.update).not.toHaveBeenCalledWith();
    });

    it('unsubscribe should turn off listening to status', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let form = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        await form.unsubscribe();
        expect(formRefMock.off).toHaveBeenCalled();
        expect(formRefMock.off).toHaveBeenCalledWith("child_changed", _callback);
    });
});

describe('submitCancellableForm with custom uid', () => {
    const serviceUid = "service"
    beforeAll(() => {
        jest.clearAllMocks();
        initClient(
            adminInstance,
            serviceUid,
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

    it('should should use service uid', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted', 'Finished'];
        await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();

        expect(formRefMock.ref).toHaveBeenCalledWith(`forms/${serviceUid}`);
    });

    it('should use custom uid passed in formData', async () => {
        let customUid = "12345678";
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted', 'Finished'];
        await submitCancellableForm(
            formData, statusHandlerMock, customUid);
        await runCallback();

        expect(formRefMock.ref).toHaveBeenCalledWith(`forms/${customUid}`);
    });
});

let finalFormData = {"@status": "finished", ...formData};

describe('submitForm', () => {
    beforeAll(() => {
        initClient(adminInstance, uid);
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
