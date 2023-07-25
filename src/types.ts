export type FormStatus = "submit" | "submitted" | "validation-error"
    | "security-error" | "finished" | "delay" | "cancel" | "cancelled";

export interface FormData {
    "@action": "create" | "update" | "delete";

    [key: string]: any;
}

export type FormStatusHandler = (status: FormStatus, data: FormData) => void;
