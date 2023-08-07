export type FormStatus = "submit" | "submitted" | "validation-error"
    | "security-error" | "finished" | "delay" | "cancel" | "cancelled" | "error";
export interface FormData {
    "@actionType": "create" | "update" | "delete";

    [key: string]: any;
}
export type FormStatusHandler = (status: FormStatus, data: FormData, isLastUpdate: boolean) => void;
