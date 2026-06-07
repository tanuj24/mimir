const KEY = "mimir.region";

export const REGIONS = [
  { id: "us-east-1", name: "US East (N. Virginia)" },
  { id: "us-east-2", name: "US East (Ohio)" },
  { id: "us-west-1", name: "US West (N. California)" },
  { id: "us-west-2", name: "US West (Oregon)" },
  { id: "eu-west-1", name: "Europe (Ireland)" },
  { id: "eu-central-1", name: "Europe (Frankfurt)" },
  { id: "ap-south-1", name: "Asia Pacific (Mumbai)" },
  { id: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
  { id: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
];

export function getRegion(): string {
  return localStorage.getItem(KEY) ?? "us-east-1";
}

export function setRegion(region: string): void {
  localStorage.setItem(KEY, region);
}
