import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import scansRouter from "./scans";
import toolsRouter from "./tools";
import proxiesRouter from "./proxies";
import vulnerabilitiesRouter from "./vulnerabilities";
import reportsRouter from "./reports";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(scansRouter);
router.use(toolsRouter);
router.use(proxiesRouter);
router.use(vulnerabilitiesRouter);
router.use(reportsRouter);
router.use(statsRouter);

export default router;
