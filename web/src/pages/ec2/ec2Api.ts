import { api } from "@/lib/api";

export interface Instance {
  id: string;
  name?: string;
  type?: string;
  state?: string;
  privateIp?: string;
  publicIp?: string;
  az?: string;
  imageId?: string;
  launchTime?: string;
  vpcId?: string;
}
export interface SecurityGroup {
  id: string;
  name?: string;
  description?: string;
  vpcId?: string;
  inboundRules: number;
  outboundRules: number;
}
export interface Vpc {
  id: string;
  name?: string;
  cidr?: string;
  state?: string;
  isDefault?: boolean;
}
export interface Image {
  id: string;
  name?: string;
  description?: string;
  architecture?: string;
  state?: string;
}

export const ec2Api = {
  instances: (): Promise<{ instances: Instance[] }> => api.get("/ec2/instances"),
  launch: (body: { imageId: string; instanceType?: string; name?: string; count?: number }) =>
    api.post("/ec2/instances", body),
  setState: (ids: string[], action: "start" | "stop" | "terminate") =>
    api.post("/ec2/instances/state", { ids, action }),
  securityGroups: (): Promise<{ groups: SecurityGroup[] }> => api.get("/ec2/security-groups"),
  vpcs: (): Promise<{ vpcs: Vpc[] }> => api.get("/ec2/vpcs"),
  images: (): Promise<{ images: Image[] }> => api.get("/ec2/images"),
};
