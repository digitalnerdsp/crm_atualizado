import { getApiUrl } from "@/fetchers/get-api-url";

export type OpenApiSchema = {
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  $ref?: string;
  nullable?: boolean;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
};

export type OpenApiParameter = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
};

export type OpenApiMediaType = {
  schema?: OpenApiSchema;
};

export type OpenApiResponse = {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
};

export type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, OpenApiMediaType>;
  };
  responses?: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
};

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Partial<Record<string, OpenApiOperation>>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    securitySchemes?: Record<string, unknown>;
  };
};

export async function getAdminOpenApiSpec(): Promise<OpenApiDocument> {
  const response = await fetch(getApiUrl("/admin/openapi"), {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as OpenApiDocument;
}
