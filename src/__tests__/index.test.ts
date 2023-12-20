import * as index from '../index';
import {initClient, submitCancellableForm, submitForm} from '../index';
import {FormData} from '../types';

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

function runCallback() {
    for (const status of statusTransition) {
        _callback({
            val: jest.fn(() => (status)),
            key: "@status",
        });
    }
}

const onReturnMock = jest.fn();
const formRefMock = {
    key: 'testDocId',
    set: jest.fn((formData: any) => {
        _formData = formData;
    }),
    push: jest.fn().mockReturnThis(),
    on: jest.fn((eventType: string, callback: Function) => {
        _callback = callback;
        return onReturnMock;
    }),
    off: jest.fn(),
    update: jest.fn(),
    once: jest.fn((eventType: string, callback: Function) => {
        const mockSnapshot = {
            val: () => {
                return {
                    "@status": "validation-error",
                    "@messages": {name: "Invalid"}
                };
            }
        };
        callback(mockSnapshot);
    }),
};

const dbRefMock = jest.fn();
jest.mock('@react-native-firebase/database', () => ({
    __esModule: true,
    firebase: {
        app: jest.fn(() => ({
            database: jest.fn(() => ({
                ref: dbRefMock,
            })),
        })),
    },
}));


describe('submitCancellableForm', () => {
    beforeAll(() => {
        initClient('testRtdbUrl', uid);
    });
    it('should set form data and listen for status changes', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted', 'finished'];
        let submittedForm = await submitCancellableForm(formData, statusHandlerMock, 200);
        runCallback();
        const submittedAt = new Date();

        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/${uid}`);
        expect(submittedForm).toBeDefined();
        expect(typeof submittedForm.cancel).toBe('function');
        expect(typeof submittedForm.unsubscribe).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), submittedAt, "@status": "submit"});
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
        runCallback();
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
        runCallback();
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
        runCallback();
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
        runCallback();
        await form.unsubscribe();
        expect(formRefMock.off).toHaveBeenCalled();
        expect(formRefMock.off).toHaveBeenCalledWith("child_changed", onReturnMock);
    });

    it('validation-error status should pass @messages in statusHandlers', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'validation-error'];
        await submitCancellableForm(formData, statusHandlerMock);
        runCallback();
        const submittedAt = new Date();

        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/${uid}`);
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), submittedAt, "@status": "submit"});
        expect(formRefMock.once).toHaveBeenCalledWith('value', expect.any(Function));
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
        await submitCancellableForm(formData, statusHandlerMock);
        runCallback();
        const submittedAt = new Date();

        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/${uid}`);
        expect(formRefMock.set).toHaveBeenCalledWith({
            formData: JSON.stringify(formData), submittedAt, "@status": "submit"
        });
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
        initClient('testRtdbUrl', uid);
    });

    const valMock = jest.fn();

    const formRefMock = {
        key: 'testDocId',
        set: jest.fn((formData: any) => {
            _formData = formData;
        }),
        push: jest.fn().mockReturnThis(),
        once: jest.fn().mockResolvedValue({val: valMock}),
        on: jest.fn((eventType: string, callback: Function) => {
            _callback = callback;
            return onReturnMock;
        }),
        off: jest.fn(),
        update: jest.fn(),
    };

    it("should return an error status and a message when submitCancellableForm reaches the timeout, and the status is not in a terminal state", async () => {
        jest.useFakeTimers();
        const timeout = 5000;
        statusTransition = ['submit', 'submitted', 'delay'];
        statusAtTimeout = {"@status": statusTransition[statusTransition.length - 1]};
        valMock.mockReturnValueOnce({...formData, ...statusAtTimeout});

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
        runCallback();
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
            "@message": "timeout waiting for last status update",
        }, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    })

    it("should not return an error status and a message when submitCancellableForm reaches the timeout, and the status is a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted', 'finished'];
        statusAtTimeout = {"@status": statusTransition[statusTransition.length - 1]};
        valMock.mockReturnValueOnce({...formData, ...statusAtTimeout});
        const timeout = 1000;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
        runCallback();
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
        statusAtTimeout = {"@status": 'finished'};
        valMock.mockReturnValueOnce({...formData, ...statusAtTimeout});
        const timeout = 1000;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitCancellableForm(formData, statusHandlerMock, timeout);
        runCallback();
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
            'testRtdbUrl',
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
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted', 'Finished'];
        let cancelForm = await submitCancellableForm(formData, statusHandlerMock);
        runCallback();
        const submittedAt = new Date();

        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/${uid}`);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), submittedAt, "@status": "Submit"});
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
        runCallback();
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
        runCallback();
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
        runCallback();
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
        runCallback();
        await form.unsubscribe();
        expect(formRefMock.off).toHaveBeenCalled();
        expect(formRefMock.off).toHaveBeenCalledWith("child_changed", onReturnMock);
    });
});

let finalFormData = {"@status": "finished", ...formData};
describe('submitForm', () => {
    beforeAll(() => {
        initClient('testRtdbUrl', uid);
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