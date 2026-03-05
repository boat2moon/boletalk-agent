import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { getBehaviouralQuestionsTool } from "./ai/tools/behavioural-questions";
import type { createDocument } from "./ai/tools/create-document";
import type { getWeather } from "./ai/tools/get-weather";
import type { ragSearchTool } from "./ai/tools/rag-search";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { getResumeTemplateTool } from "./ai/tools/resume-template";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type getResumeTemplateToolType = InferUITool<typeof getResumeTemplateTool>;
type getBehaviouralQuestionsToolType = InferUITool<
  typeof getBehaviouralQuestionsTool
>;
type ragSearchToolType = InferUITool<typeof ragSearchTool>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  getResumeTemplate: getResumeTemplateToolType;
  getBehaviouralQuestions: getBehaviouralQuestionsToolType;
  ragSearch: ragSearchToolType;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  usage: AppUsage;
  ttsAudio: {
    audioBase64: string;
    mimeType: string;
    provider: string;
    degraded: string[];
  };
  /** 面试评估结构化结果 */
  evaluation: {
    scores: {
      technical: number;
      communication: number;
      logic: number;
      project: number;
      overall: number;
    };
    comments: {
      summary: string;
      strengths: string[];
      improvements: string[];
    };
  };
  /** 面试评估生成失败错误信息 */
  evaluationError: string;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  base64?: string; // PDF 文件的 base64 编码内容（可选）
  contentType: string;
};
