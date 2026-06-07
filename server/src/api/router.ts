import { Hono } from 'hono';
import leaguesRouter from './leagues/router';
import roundsRouter from './rounds/router';
import entriesRouter from './entries/router';
import commentsRouter from './comments/router';
import ballotsRouter from './ballots/router';

const router = new Hono();

router.route('/leagues', leaguesRouter);
router.route('/leagues/:leagueId/rounds', roundsRouter);
router.route('/rounds/:roundId/entries', entriesRouter);
router.route('/rounds/:roundId/entries/:entryId/comments', commentsRouter);
router.route('/rounds/:roundId/ballot', ballotsRouter);

export default router;
