export type FormStatus = "submit" | "submitted" | "validation-error"
    | "security-error" | "finished" | "delay" | "cancel" | "cancelled" | "error";
export type FormActionType = "create" | "update" | "delete";
export interface FormData {
    "@docPath": string;
    "@actionType": FormActionType;
    "@metadata"?: Record<string, any>;
    [key: string]: any;
}
export type FormStatusHandler = (status: FormStatus, data: FormData, isLastUpdate: boolean) => void;
