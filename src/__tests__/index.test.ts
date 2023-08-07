import {initClient, submitForm} from '../index';
import {FormData} from '../types';

// Mock the firebase database module
const formData : FormData = {
    '@actionType': 'create',
    // Add other form data properties here...
    name: 'testName',
};
let statusTransition = ['submitted'];
let _callback : Function;
let _formData : FormData;
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

// Mock the auth module
const docPath = 'forms/testUserId/testDocId';
initClient('testDatabaseName', 'testRegion');

describe('submitForm', () => {
    it('should set form data and listen for status changes', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted', 'finished'];
        let cancelForm = await submitForm(docPath, formData, statusHandlerMock);
        runCallback();

        expect(dbRefMock.mock.calls[0][0]).toBe(`forms/testUserId`);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(
            {...formData, "@docPath": docPath, "@status": "submit"}
        );
        expect(formRefMock.on).toHaveBeenCalledWith('child_changed', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted',
            {"@docPath": docPath, ...formData, "@status": "submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished',
            {"@docPath": docPath, ...formData, "@status": "finished"}, true);
        expect(formRefMock.off).toHaveBeenCalledWith('child_changed', expect.any(Function));
    });

    it('cancel should return false if form has no @delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted'];
        let cancelForm = await submitForm(docPath, formData, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay'];
        let cancelForm = await submitForm(docPath, {
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
        let cancelForm = await submitForm(docPath, {
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
        let form = await submitForm(docPath, formData, statusHandlerMock);
        runCallback();
        const cancelResult = await form.unsubscribe();
        expect(formRefMock.off).toHaveBeenCalled();
        expect(formRefMock.off).toHaveBeenCalledWith("child_changed", onReturnMock );
    });
});
