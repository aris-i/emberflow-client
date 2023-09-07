import {initClient, submitForm} from '../index';
import {FormData} from '../types';
import {off, onChildChanged, ref, set, update, get} from "firebase/database";
import {initializeApp} from "firebase/app";

// Mock the firebase database module
const formData : FormData = {
    "@actionType": "create",
    "@docPath": "forms/testUserId/testDocId",
    "name": 'testName',
};
let statusTransition = ['submitted'];
let _callback : Function;
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
};

const dbRefMock = jest.fn();
jest.mock('firebase/database', () => ({
    __esModule: true,
    set: jest.fn(),
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
        val: jest.fn().mockReturnValue({
            "@messages": {name: "Invalid"},
        }),
    }),
}));

jest.mock('@firebase/app', () => ({
    __esModule: true,
    registerVersion: jest.fn(),
    initializeApp: jest.fn(),
}));

// Mock the auth module
const app = initializeApp({});

describe('submitForm', () => {
    beforeAll(() => {
        initClient(
            app,
            'https://testDatabaseName.testRegion.firebasedatabase.app',
        );
    });
    it('should set form data and listen for status changes', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submitted', 'finished'];
        let cancelForm = await submitForm(formData, statusHandlerMock);
        runCallback();

        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/testUserId`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(set).toHaveBeenCalledWith(
            onReturnMock,
            {formData: JSON.stringify(formData), "@status": "submit"}
        );
        expect(onChildChanged).toHaveBeenCalledWith(onReturnMock, expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted',
            {...formData, "@status": "submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('finished',
            {...formData, "@status": "finished"}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", expect.any(Function));
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
        expect(update).toHaveBeenCalledWith(onReturnMock, {"@status": "cancel"});

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
        expect(update).not.toHaveBeenCalledWith();
    });

    it('unsubscribe should turn off listening to status', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['delay', 'submitted'];
        let form = await submitForm(formData, statusHandlerMock);
        runCallback();
        await form.unsubscribe();
        expect(off).toHaveBeenCalled();
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", onReturnMock );
    });

    it('validation-error status should pass @messages in statusHandlers', async () => {
        jest.clearAllMocks();
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'validation-error'];
        let cancelForm = await submitForm(formData, statusHandlerMock);
        runCallback();

        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/testUserId`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(set).toHaveBeenCalledWith(
            onReturnMock,
            {formData: JSON.stringify(formData), "@status": "submit"}
        );
        expect(onChildChanged).toHaveBeenCalledWith(onReturnMock, expect.any(Function));
        expect(get).toHaveBeenCalledTimes(1);
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('validation-error',
            {...formData, "@status": "validation-error", "@messages": {name: "Invalid"}}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", expect.any(Function));
    });

    it('security-error status should pass @messages in statusHandlers', async () => {
        jest.clearAllMocks();
        dbRefMock.mockReturnValue(formRefMock);
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'security-error'];
        await submitForm(formData, statusHandlerMock);
        runCallback();
        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/testUserId`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(set)
            .toHaveBeenCalledWith(onReturnMock, { formData: JSON.stringify(formData), "@status": "submit"});
        expect(get).toHaveBeenCalledTimes(1);
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('submit',
            {...formData, "@status": "submit"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('security-error',
            {...formData, "@status": "security-error", "@messages": {"name": "Invalid"}}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, 'child_changed', expect.any(Function));
    });
});

describe('submitForm with custom status map', () => {
    beforeAll(() => {
        jest.clearAllMocks();
        initClient(
            app,
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
        let cancelForm = await submitForm( formData, statusHandlerMock);
        runCallback();

        expect(ref).toHaveBeenCalledWith(formRefMock, `forms/testUserId`);
        expect(ref).toHaveBeenCalledTimes(1);
        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(set).toHaveBeenCalledWith(
            onReturnMock,
            {formData: JSON.stringify(formData), "@status": "Submit"}
        );
        expect(onChildChanged).toHaveBeenCalledWith(onReturnMock, expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledTimes(2);
        expect(statusHandlerMock).toHaveBeenCalledWith('Submitted',
            {...formData, "@status": "Submitted"}, false);
        expect(statusHandlerMock).toHaveBeenCalledWith('Finished',
            {...formData, "@status": "Finished"}, true);
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", expect.any(Function));
    });

    it('cancel should return false if form has no @delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Submitted'];
        let cancelForm = await submitForm( formData, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay'];
        let cancelForm = await submitForm( {
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(true);
        expect(update).toHaveBeenCalledWith(onReturnMock, {"@status": "Cancel"});
    });

    it('cancel should return false if form has @delay but status is already submitted', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let cancelForm = await submitForm( {
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
        expect(update).not.toHaveBeenCalledWith();
    });

    it('unsubscribe should turn off listening to status', async () => {
        dbRefMock.mockReturnValue(formRefMock);
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['Delay', 'Submitted'];
        let form = await submitForm( formData, statusHandlerMock);
        runCallback();
        await form.unsubscribe();
        expect(off).toHaveBeenCalled();
        expect(off).toHaveBeenCalledWith(onReturnMock, "child_changed", onReturnMock );
    });
});
