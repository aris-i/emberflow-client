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
    set: jest.fn((formData) => {
        _formData = formData;
    }),
    push: jest.fn().mockReturnThis(),
    once: jest.fn().mockResolvedValue({val: jest.fn().mockReturnValue(statusAtTimeout)}),
    on: jest.fn((eventType: string, callback: Function) => {
        _callback = callback;
        return onReturnMock;
    }),
    off: jest.fn(),
    update: jest.fn(),
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

    it('terminal state', async () => {
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

        // const timeout = 1000;
        // const submittedForm = await submitForm(formData, statusHandlerMock, timeout);
        // runCallback();
        //
        // expect(submittedForm).toBeDefined();
        // expect(statusHandlerMock).toHaveBeenCalledWith('submitted', {
        //     ...formData,
        //     "@status": 'submitted',
        // }, false);
        // expect(statusHandlerMock).toHaveBeenCalledWith('finished', {
        //     ...formData,
        //     "@status": 'finished',
        // }, true);
        //
        // // Fast-forward time to invoke the setTimeout
        // setTimeout(() => {
        //     expect(submittedForm).toBeCalled();
        //     expect(statusHandlerMock).toHaveBeenCalledTimes(3);
        //     expect(statusHandlerMock).toHaveBeenCalledWith('error', {
        //         ...formData,
        //         "@message": "timeout waiting for last status update",
        //         "@status": 'error'
        //     }, true);
        //     expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
        // }, timeout + 100)

    });

    it("non terminal state", async () => {
        statusTransition = ['submit', 'submitted'];
        const timeout = 1000;

        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        let submittedForm = await submitForm(formData, statusHandlerMock, timeout);
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

        // Fast-forward time to invoke the setTimeout
        setTimeout(async () => {
            expect(submittedForm).toBeCalled();
            expect(statusHandlerMock).toHaveBeenCalledTimes(3);
            expect(statusHandlerMock).toHaveBeenCalledWith('error', {
                ...formData,
                "@message": "timeout waiting for last status update",
                "@status": 'error'
            }, true);
            expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
        }, timeout + 100)
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
