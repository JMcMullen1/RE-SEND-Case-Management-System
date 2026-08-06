/**
 * Repositories are the ONLY place in the codebase that touches the database.
 * Routes and services call repository functions; they never import the Drizzle
 * client directly. Concrete repositories (users, cases, notes, …) are added in
 * later prompts.
 */

export {};
