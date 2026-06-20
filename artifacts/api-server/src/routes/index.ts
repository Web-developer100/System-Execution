import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import scansRouter from "./scans";
import toolsRouter from "./tools";
import proxiesRouter from "./proxies";
import vulnerabilitiesRouter from "./vulnerabilities";
import reportsRouter from "./reports";
import statsRouter from "./stats";
import systemRouter from "./system";
import metricsRouter from "./metrics";
import organizationsRouter from "./organizations";
import pluginsRouter from "./plugins";
import observabilityRouter from "./observability";
import wordlistRouter from "./wordlist";
import auditRouter from "./audit";
import schedulingRouter from "./scheduling";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(scansRouter);
router.use(toolsRouter);
router.use(proxiesRouter);
router.use(vulnerabilitiesRouter);
router.use(reportsRouter);
router.use(statsRouter);
router.use(systemRouter);
router.use(metricsRouter);
router.use(organizationsRouter);
router.use(pluginsRouter);
router.use(observabilityRouter);
router.use(wordlistRouter);
router.use(auditRouter);
router.use(schedulingRouter);

export default router;
