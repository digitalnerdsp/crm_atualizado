export type ProjectBroadcastMessage = {
  type: string;
  /**
   * The room key. Project boards use the project id; the CRM pipeline board
   * uses `crm:<pipelineId>` (see `crmPipelineRoom`), which shares this
   * transport without colliding with real project ids.
   */
  projectId: string;
  taskId?: string;
  sourceTaskId?: string;
  targetTaskId?: string;
  dealId?: string;
  stageId?: string;
};

export type BroadcastMessage = {
  projectId: string;
  message: ProjectBroadcastMessage;
  excludeInitiatorId?: string;
};

export type BroadcastAdapter = {
  /** Publish a message to all instances watching this project */
  publish(msg: BroadcastMessage): Promise<void>;

  /** Subscribe to messages for delivery to local connections */
  subscribe(handler: (msg: BroadcastMessage) => void): Promise<void>;

  /** Cleanup on shutdown */
  shutdown(): Promise<void>;
};
