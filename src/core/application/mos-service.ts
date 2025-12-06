/**
 * MOS Service Implementation
 *
 * Application layer implementation that provides the MOSService contract
 * using infrastructure clients.
 */

import { Layer } from "effect";
import { MOSService } from "~/core/domain/services";
import { placeholderMOSClient } from "~/core/infrastructure";

// ============================================================================
// Live Layer
// ============================================================================

/**
 * Live MOS Service Layer
 *
 * Uses the placeholder MOS client. Replace with real client when available.
 */
export const MOSServiceLive = Layer.succeed(MOSService, {
  calculateMOS: placeholderMOSClient.calculateMOS,
  isAvailable: placeholderMOSClient.isAvailable,
  getProviderInfo: placeholderMOSClient.getProviderInfo,
});

// ============================================================================
// Factory for Custom Clients
// ============================================================================

/**
 * Create a MOS Service Layer from a custom client
 */
export function createMOSServiceLayer(client: {
  readonly calculateMOS: typeof placeholderMOSClient.calculateMOS;
  readonly isAvailable: typeof placeholderMOSClient.isAvailable;
  readonly getProviderInfo: typeof placeholderMOSClient.getProviderInfo;
}) {
  return Layer.succeed(MOSService, {
    calculateMOS: client.calculateMOS,
    isAvailable: client.isAvailable,
    getProviderInfo: client.getProviderInfo,
  });
}
