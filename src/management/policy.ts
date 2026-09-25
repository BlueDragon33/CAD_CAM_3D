export type WorkspaceDensity = 'compact' | 'engineering' | 'comfortable';
export type PhoneMode = 'review-only' | 'full';

export type ManagementPolicy = {
  workspaceDensity: WorkspaceDensity;
  aiCommandBridge: boolean;
  printValidation: boolean;
  experimentalCadFeatures: boolean;
  phoneMode: PhoneMode;
};

export const managementIdentity = {
  appId: 'cad-cam-3d',
  appName: 'CAD CAM 3D',
  controlPlane: 'Quản trị Ứng dụng',
  repository: 'BlueDragon33/CAD_CAM_3D',
} as const;

/**
 * Safe local defaults. The central control-plane will be allowed to override
 * these policy values once the remote management bridge is connected.
 * Project geometry, meshes and user design files are never part of this policy.
 */
export const defaultManagementPolicy: ManagementPolicy = {
  workspaceDensity: 'engineering',
  aiCommandBridge: true,
  printValidation: true,
  experimentalCadFeatures: false,
  phoneMode: 'review-only',
};
