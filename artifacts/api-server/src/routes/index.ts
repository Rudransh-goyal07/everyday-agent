import { Router, type IRouter } from "express";
import healthRouter from "./health";
import everydayRouter from "./everyday";

const router: IRouter = Router();

router.use(healthRouter);
router.use(everydayRouter);

export default router;
