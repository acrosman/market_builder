/**
 * The military agent: take worlds by force rather than buy them.
 *
 * **Placeholder.** The game has no invasion mechanics -- no fleets that move
 * with intent, no combat resolution between a fleet and a world's defences, no
 * rules for what changes hands when a world falls. Until those exist there is
 * nothing for this agent to do, so it does nothing rather than approximate an
 * outcome the rest of the game could not show or contest.
 *
 * It exists now so the shape of the decision is settled while the interface is
 * being designed rather than bolted on afterwards, and so a corporation can
 * already be assigned a strategy the market agent does not cover.
 *
 * What it will need when invasion lands:
 * - a target rule: which world, weighed by its defences against its value
 * - a build-up rule: fighters and ships bought ahead of an attack, which is
 *   what makes an invasion visible before it happens and therefore counterable
 * - a resolution call into whatever adjudicates combat
 * - a transfer that books the seized world at appraised value, through
 *   `recordAssetTransfer`, so a conquest cannot manufacture earnings
 */

module.exports = {
  name: 'military',
  descriptionKey: 'npc_corporations.agents.military',

  /**
   * Take no action: the mechanics this agent needs do not exist yet.
   * @returns {Array<Object>} Always empty.
   * @example
   * militaryAgent.act({ game, corporation, tick }); // => []
   */
  act() {
    return [];
  }
};
