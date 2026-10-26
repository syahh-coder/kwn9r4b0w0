import { notFound } from "next/navigation";
// Do not expose draft reports here. Implement DB query with published-only access.
export default async function ReportDetail() { notFound(); }
