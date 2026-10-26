import { Hono } from "hono";
import activity from "./activity";
import company from "./company";
import contact from "./contact";
import contract from "./contract";
import deal from "./deal";
import field from "./field";
import hosting from "./hosting";
import importRoutes from "./import";
import pipeline from "./pipeline";
import report from "./report";
import sale from "./sale";
import service from "./service";
import taxonomy from "./taxonomy";

/**
 * The CRM lives under one directory with sub-modules instead of eight
 * directories at the root of `src/`, which is where every other feature sits.
 * Documented deviation: see plans/crm/README.md, decision D4.
 */
const crm = new Hono()
  .route("/pipeline", pipeline)
  .route("/deal", deal)
  .route("/sale", sale)
  .route("/contact", contact)
  .route("/company", company)
  .route("/hosting", hosting)
  .route("/contract", contract)
  .route("/activity", activity)
  .route("/field", field)
  .route("/import", importRoutes)
  .route("/report", report)
  .route("/service", service)
  .route("/taxonomy", taxonomy);

export default crm;
