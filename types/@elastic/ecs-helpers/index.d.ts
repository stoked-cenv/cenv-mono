declare module '@elastic/ecs-helpers' {
  import http from 'http';

  const version: string;

  function stringify(ecs: any): string;

  function formatError(ecsFields: any, err: any): boolean;

  function formatHttpRequest(ecs: any, req: http.IncomingMessage): boolean;

  function formatHttpResponse(ecs: any, req: http.ServerResponse): boolean;
}