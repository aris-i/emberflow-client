import {initClient, submitForm} from '../index';
import {FormData} from '../types';

// Mock the firebase database module
const formData: FormData = {
    "@actionType": "create",
    "@docPath": "forms/testUserId/testDocId",
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


describe('submitForm', () => {
    beforeAll(() => {
        initClient('testDatabaseName', 'testRegion');
    });
    it('should set form data and listen for status changes', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted', 'finished'];
        let submittedForm = await submitForm(formData, statusHandlerMock, 200);
        runCallback();

        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/testUserId`);
        expect(submittedForm).toBeDefined();
        expect(typeof submittedForm.cancel).toBe('function');
        expect(typeof submittedForm.unsubscribe).toBe('function');
        expect(formRefMock.set)
            .toHaveBeenCalledWith({formData: JSON.stringify(formData), "@status": "submit"});
        expect(formRefMock.on).toHaveBeenCalledWith('child_changed', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted',
            {...formData, "@status": "submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished',
            {...formData, "@status": "finished"}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    });

    it('cancel should return false if form has no @delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted'];
        let cancelForm = await submitForm(formData, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay'];
        let cancelForm = await submitForm({
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
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay', 'submitted'];
        let cancelForm = await submitForm({
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
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay', 'submitted'];
        let form = await submitForm(formData, statusHandlerMock);
        runCallback();
        await form.unsubscribe();
        expect(formRefMock.off).toHaveBeenCalled();
        expect(formRefMock.off).toHaveBeenCalledWith("child_changed", onReturnMock);
    });

    it('validation-error status should pass @messages in statusHandlers', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'validation-error'];
        await submitForm(formData, statusHandlerMock);
        runCallback();
        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/testUserId`);
        expect(formRefMock.set)
            .toHaveBeenCalledWith({formData: JSON.stringify(formData), "@status": "submit"});
        expect(formRefMock.once).toHaveBeenCalledWith('value', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('validation-error',
            {...formData, "@status": "validation-error", "@messages": {"name": "Invalid"}}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    });

    it('security-error status should pass @messages in statusHandlers', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'security-error'];
        await submitForm(formData, statusHandlerMock);
        runCallback();
        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/testUserId`);
        expect(formRefMock.set)
            .toHaveBeenCalledWith({formData: JSON.stringify(formData), "@status": "submit"});
        expect(formRefMock.on).toHaveBeenCalledWith('child_changed', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('security-error',
            {...formData, "@status": "security-error", "@messages": {"name": "Invalid"}}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    });

    it("should return an error status and a message when submitForm reaches the timeout, and the status is not in a terminal state", async () => {
        jest.useFakeTimers();
        const timeout = 5000;

        const formRefMock = {
            key: 'testDocId',
            set: jest.fn((formData: any) => {
                _formData = formData;
            }),
            push: jest.fn().mockReturnThis(),
            once: jest.fn().mockResolvedValue({val: jest.fn().mockReturnValue({...formData, ...statusAtTimeout})}),
            on: jest.fn((eventType: string, callback: Function) => {
                _callback = callback;
                return onReturnMock;
            }),
            off: jest.fn(),
            update: jest.fn(),
        };

        statusTransition = ['submit', 'submitted', 'delay'];
        statusAtTimeout = {"@status": statusTransition[statusTransition.length - 1]};

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitForm(formData, statusHandlerMock, timeout);
        runCallback();

        expect(submittedForm).toBeDefined();
        expect(statusHandlerMock).toHaveBeenCalledWith('submit', {
            ...formData,
            "@status": 'submit',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted', {
            ...formData,
            "@status": 'submitted',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('delay', {
            ...formData,
            "@status": 'delay',
        }, false);

        await jest.advanceTimersByTime(timeout);

        expect(statusHandlerMock).toHaveBeenCalledTimes(4);
        expect(statusHandlerMock).toHaveBeenCalledWith('error', {
            ...formData,
            "@status": 'error',
            "@message": "timeout waiting for last status update",
        }, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    })

    it("should not return an error status and a message when submitForm reaches the timeout, and the status is a terminal state", async () => {
        jest.useFakeTimers();
        statusTransition = ['submit', 'submitted', 'finished'];
        statusAtTimeout = {"@status": statusTransition[statusTransition.length - 1]};
        const timeout = 1000;

        async function runCallback() {
            for (const status of statusTransition) {
                const index = statusTransition.indexOf(status);
                const isLastItem = index === statusTransition.length - 1;

                if (isLastItem) {
                    await jest.advanceTimersByTime(timeout)
                    _callback({
                        val: jest.fn(() => status),
                        key: "@status",
                    });
                } else {
                    _callback({
                        val: jest.fn(() => status),
                        key: "@status",
                    });
                }
            }
        }

        const formRefMock = {
            key: 'testDocId',
            set: jest.fn((formData: any) => {
                _formData = formData;
            }),
            push: jest.fn().mockReturnThis(),
            once: jest.fn().mockResolvedValue({val: jest.fn().mockReturnValue({...formData, ...statusAtTimeout})}),
            on: jest.fn((eventType: string, callback: Function) => {
                _callback = callback;
                return onReturnMock;
            }),
            off: jest.fn(),
            update: jest.fn(),
        };

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        const submittedForm = await submitForm(formData, statusHandlerMock, timeout);
        runCallback();

        expect(submittedForm).toBeDefined();
        expect(statusHandlerMock).toHaveBeenCalledWith('submit', {
            ...formData,
            "@status": 'submit',
        }, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted', {
            ...formData,
            "@status": 'submitted',
        }, false);

        await jest.advanceTimersByTime(timeout);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished', {
            ...formData,
            "@status": 'finished',
        }, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    })

    afterEach(() => {
        jest.useRealTimers()
    })
});

describe('submitForm with custom status map', () => {
    beforeAll(() => {
        jest.clearAllMocks();
        initClient(
            'testDatabaseName', 'testRegion',
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
        let cancelForm = await submitForm(formData, statusHandlerMock);
        runCallback();

        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/testUserId`);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(
            {formData: JSON.stringify(formData), "@status": "Submit"}
        );
        expect(formRefMock.on).toHaveBeenCalledWith('child_changed', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('Submitted',
            {...formData, "@status": "Submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('Finished',
            {...formData, "@status": "Finished"}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    });

    it('cancel should return false if form has no @delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted'];
        let cancelForm = await submitForm(formData, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay'];
        let cancelForm = await submitForm({
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
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let cancelForm = await submitForm({
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
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let form = await submitForm(formData, statusHandlerMock);
        runCallback();
        await form.unsubscribe();
        expect(formRefMock.off).toHaveBeenCalled();
        expect(formRefMock.off).toHaveBeenCalledWith("child_changed", onReturnMock);
    });
});
