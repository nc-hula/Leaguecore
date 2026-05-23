import { Router } from 'express';
import leaguesRouter from './leagues/router';
import roundsRouter from './rounds/router';
import entriesRouter from './entries/router';
import commentsRouter from './comments/router';
import ballotsRouter from './ballots/router';

const router = Router();

router.use('/leagues', leaguesRouter);
router.use('/leagues/:leagueId/rounds', roundsRouter);
router.use('/rounds/:roundId/entries', entriesRouter);
router.use('/rounds/:roundId/entries/:entryId/comments', commentsRouter);
router.use('/rounds/:roundId/ballot', ballotsRouter);

export default router;
