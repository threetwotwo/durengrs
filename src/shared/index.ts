/**
 * Shared contract between the web app and the WhatsApp bot: the farm's words, stage scale, issue list, health
 * labels, triage and label rules. No React, no Firebase, so the bot can import it unchanged.
 * See docs/data-contract.md for the records both sides read and write.
 */
export * from './text';
export * from './stages';
export * from './issues';
export * from './health';
export * from './triage';
export * from './labels';
export * from './crop';
export * from './actions';
