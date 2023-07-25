import {initClient, submitForm} from '../index';
import {FormData} from '../types';

// Mock the firebase database module
const formData : FormData = {
    '@action': 'create',
    '@status': 'submit',
    // Add other form data properties here...
    name: 'testName',
};
let statusTransition = ['submit', 'submitted'];
let _callback : Function;
let _formData : FormData;
function runCallback() {
    for (const status of statusTransition) {
        _callback({
            val: jest.fn(() => ({
                ..._formData,
                '@status': status,
            })),
        });
    }
}

const formRefMock = {
    on: jest.fn((eventType: string, callback: Function) => {
        _callback = callback;
        return jest.fn();
    }),
    off: jest.fn(),
    set: jest.fn((formData) => {
        _formData = formData;
    }),
    update: jest.fn(),
};
jest.mock('@react-native-firebase/database', () => ({
    __esModule: true,
    firebase: {
        app: jest.fn(() => ({
            database: jest.fn(() => ({
                ref: jest.fn(() => formRefMock)
            })),
        })),
    },
}));

// Mock the auth module
jest.mock('@react-native-firebase/auth', () => {
    return {
        __esModule: true,
        default: jest.fn(() => ({
            currentUser: { uid: 'testUserId' },
        })),
    };
});

const path = 'forms/testUserId/testDocId';
initClient('testDatabaseName', 'testRegion');

describe('submitForm', () => {
    it('should set form data and listen for status changes', async () => {
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'submitted', 'finished'];
        let cancelForm = await submitForm(path, formData, statusHandlerMock);
        runCallback();

        expect(cancelForm).toBeDefined();
        expect(typeof cancelForm.cancel).toBe('function');
        expect(formRefMock.set).toHaveBeenCalledWith(formData);
        expect(formRefMock.on).toHaveBeenCalledWith('value', expect.any(Function));
        expect(statusHandlerMock).toHaveBeenCalledWith('submitted', {...formData, "@status": "submitted"});
        expect(formRefMock.off).toHaveBeenCalledWith('value', expect.any(Function));
    });

    it('cancel should return false if form has no @delay', async () => {
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'submitted'];
        let cancelForm = await submitForm(path, formData, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
    });

    it('cancel should return true if form has @delay and status is delay', async () => {
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'delay'];
        let cancelForm = await submitForm(path, {
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(true);
        expect(formRefMock.update).toHaveBeenCalledWith({"@status": "cancel"});

    });

    it('cancel should return false if form has @delay but status is already submitted', async () => {
        // Call the cancel function returned by submitForm
        const statusHandlerMock = jest.fn();
        statusTransition = ['submit', 'delay', 'submitted'];
        let cancelForm = await submitForm(path, {
            ...formData,
            "@delay": 1000,
        }, statusHandlerMock);
        runCallback();
        const cancelResult = await cancelForm.cancel();
        expect(cancelResult).toBe(false);
        expect(formRefMock.update).not.toHaveBeenCalledWith();
    });
});
