const unsubscribeMock: jest.Mock = jest.fn();
const valMock: jest.Mock = jest.fn().mockReturnValue({
    "@status": "finished",
});
const formRefMock = {
    key: 'testDocId',
    set: jest.fn((formData: any) => {
        _formData = formData;
    }),
    child: jest.fn().mockReturnValue({}),
    push: jest.fn(),
    onValue: jest.fn((query: Query, callback: Function) => {
        _callback = callback;
        return unsubscribeMock;
    }),
    update: jest.fn(),
    ref: jest.fn().mockReturnValue({}),
    get: jest.fn().mockResolvedValue({
        val: valMock,
    }),
    serverTimestamp: jest.fn(),
};

import * as index from '../index';
import {initClient, submitCancellableForm, submitForm} from '../index';
import {FormData, FormStatus} from '../types';
import {getApp} from "@react-native-firebase/app";
import {Query} from "@react-native-firebase/database/lib/modular/query";

let uid = 'testUserId';

// Mock the firebase database module
const formData: FormData = {
    "@actionType": "create",
    "@docPath": `topics/topicId`,
    "name": 'testName',
};

let statusTransition = ['submitted'];
let statusAtTimeout = {'@status': 'submitted'};

let _callback: Function;
let _formData: FormData;

async function runCallback() {
    for (let i = 0; i < statusTransition.length; i++) {
        await _callback({
            val: jest.fn(() => ({"@status": statusTransition[i]})),
        });
    }
}

jest.mock('@react-native-firebase/database', () => {
    return {
        __esModule: true,
        getDatabase: jest.fn(),
        ...formRefMock,
    }
});

jest.mock('@react-native-firebase/app', () => {
    return {
        __esModule: true,
        getApp: jest.fn(),
    }
});

const app = getApp();
const formRef = jest.fn();

describe('submitCancellableForm', () => {
    beforeAll(() => {
        initClient(app, uid);
    });
    it('should set form data and listen for status changes', async () => {
        const submittedAt = new Date();
        formRefMock.serverTimestamp.mockReturnValueOnce(submittedAt);
        formRefMock.push.mockReturnValueOnce(formRef);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted', 'finished'];
        let submittedForm = await submitCancellableForm(formData, statusHandlerMock, 200);
        await runCallback();

        expect(formRefMock.child).toHaveBeenCalledWith({}, `forms/${uid}`);
        expect(submittedForm).toBeDefined();
        expect(typeof submittedForm.cancel).toBe('function');
        expect(typeof submittedForm.unsubscribe).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(formRef,
            {formData: JSON.stringify(formData), submittedAt, "@status": "submit"});
        expect(formRefMock.onValue).toHaveBeenCalledWith(formRef, expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted',
            {...formData, submittedAt, "@status": "submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished',
            {...formData, submittedAt, "@status": "finished"}, true);
        expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('cancel should return false if form has no @delay', async () => {
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        // Call the cancel function returned by submitCancellableForm
        formRefMock.push.mockReturnValueOnce(formRef);
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay'];
        let cancelForm = await submitCancellableForm({
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(true);
        expect(formRefMock.update).toHaveBeenCalledWith(formRef, {"@status": "cancel"});

    });

    it('cancel should return false if form has @delay but status is already submitted', async () => {
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
        // Call the cancel function returned by submitCancellableForm
        formRefMock.push.mockReturnValueOnce(formRef);
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay', 'submitted'];
        let form = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();
        await form.unsubscribe();
        expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('validation-error status should pass @messages in statusHandlers', async () => {
        const submittedAt = new Date();
        formRefMock.serverTimestamp.mockReturnValueOnce(submittedAt);
        formRefMock.push.mockReturnValueOnce(formRef);
        valMock.mockReturnValueOnce({
            "@status": "validation-error",
            "@messages": {name: "Invalid"}
        });

        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'validation-error'];
        await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();

        expect(formRefMock.child).toHaveBeenCalledWith({}, `forms/${uid}`);
        expect(formRefMock.set).toHaveBeenCalledWith(formRef,
            {formData: JSON.stringify(formData), submittedAt, "@status": "submit"});
        expect(formRefMock.get).toHaveBeenCalledWith(formRef);
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, submittedAt, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('validation-error',
            {...formData, submittedAt, "@status": "validation-error", "@messages": {"name": "Invalid"}}, true);
        expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('security-error status should pass @messages in statusHandlers', async () => {
        const submittedAt = new Date();
        formRefMock.serverTimestamp.mockReturnValueOnce(submittedAt);
        formRefMock.push.mockReturnValueOnce(formRef);
        valMock.mockReturnValueOnce({
            "@status": "security-error",
            "@messages": {name: "Invalid"}
        });

        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'security-error'];
        await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();

        expect(formRefMock.child).toHaveBeenCalledWith({}, `forms/${uid}`);
        expect(formRefMock.set).toHaveBeenCalledWith(formRef,
            {formData: JSON.stringify(formData), submittedAt, "@status": "submit"});
        expect(formRefMock.onValue).toHaveBeenCalledWith(formRef, expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, submittedAt, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('security-error',
            {...formData, submittedAt, "@status": "security-error", "@messages": {"name": "Invalid"}}, true);
        expect(unsubscribeMock).toHaveBeenCalled();
    });
});

describe('submitCancellableForm with timeout', () => {
    beforeAll(() => {
        initClient(app, uid);
    });

    it("should return an error status and a message when submitCancellableForm reaches the timeout, and the status is not in a terminal state", async () => {
        jest.useFakeTimers();
        const timeout = 5000;
        statusTransition = ['submit', 'submitted', 'delay'];
        statusAtTimeout = {"@status": statusTransition[statusTransition.length - 1]};
        valMock.mockReturnValueOnce({
            ...formData,
            "@status": 'delay',
        });

        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
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
        expect(unsubscribeMock).toHaveBeenCalled();
    })

    it("should not return an error status and a message when submitCancellableForm reaches the timeout, and the status is a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted', 'finished'];
        statusAtTimeout = {"@status": statusTransition[statusTransition.length - 1]};
        const timeout = 1000;

        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
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
        expect(unsubscribeMock).toHaveBeenCalled();
    })

    it("should return a final update when submitCancellableForm reaches the timeout, and the status is in a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted'];
        statusAtTimeout = {"@status": 'finished'};
        valMock.mockReturnValueOnce({...formData, ...statusAtTimeout});
        const timeout = 1000;

        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
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
        expect(unsubscribeMock).toHaveBeenCalled();
    })
})

describe('submitCancellableForm with custom status map', () => {
    beforeAll(() => {
        jest.clearAllMocks();
        initClient(app,
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
        const submittedAt = new Date();
        formRefMock.serverTimestamp.mockReturnValueOnce(submittedAt);
        formRefMock.push.mockReturnValueOnce(formRef);

        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted', 'Finished'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        await runCallback();

        expect(formRefMock.child).toHaveBeenCalledWith({}, `forms/${uid}`);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(formRef,
            {formData: JSON.stringify(formData), submittedAt, "@status": "Submit"});
        expect(formRefMock.onValue).toHaveBeenCalledWith(formRef, expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('Submitted',
            {...formData, submittedAt, "@status": "Submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('Finished',
            {...formData, submittedAt, "@status": "Finished"}, true);
        expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('cancel should return false if form has no @delay', async () => {
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        // Call the cancel function returned by submitCancellableForm
        formRefMock.push.mockReturnValueOnce(formRef);
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay'];
        let cancelForm = await submitCancellableForm({
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        await runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(true);
        expect(formRefMock.update).toHaveBeenCalledWith(formRef, {"@status": "Cancel"});

    });

    it('cancel should return false if form has @delay but status is already submitted', async () => {
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
        formRefMock.push.mockReturnValueOnce(formRef);
        // Call the cancel function returned by submitCancellableForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let form = await submitCancellableForm(formData, statusHandlerMock);
        runCallback();
        await form.unsubscribe();
        expect(unsubscribeMock).toHaveBeenCalled();
    });
});

let finalFormData = {"@status": "finished" as FormStatus, ...formData};
describe('submitForm', () => {
    beforeAll(() => {
        initClient(app, uid);
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
