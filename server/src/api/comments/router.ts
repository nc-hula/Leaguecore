import { Router } from 'express';

// Stub router for comments — full implementation in task 13.
// mergeParams: true so that :roundId and :entryId from parent routers are accessible.
const router = Router({ mergeParams: true });

export default router;
