import { type ValidationResult } from "./contract.ts";
import { type DeliveryDeclarationV1, type DeliveryEventV1 } from "./delivery-measurement-contract.ts";
export declare function validateDeliveryEventV1(value: unknown): ValidationResult<DeliveryEventV1>;
export declare function validateDeliveryDeclarationV1(value: unknown): ValidationResult<DeliveryDeclarationV1>;
