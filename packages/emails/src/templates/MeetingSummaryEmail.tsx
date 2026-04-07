import type { TFunction } from "i18next";

import { WEBAPP_URL, COMPANY_NAME } from "@calcom/lib/constants";

import { V2BaseEmailHtml } from "../components";

interface MeetingSummaryEmailProps {
  language: TFunction;
  summary: string;
  title: string;
  date: string;
  name: string;
}

export const MeetingSummaryEmail = (
  props: MeetingSummaryEmailProps & Partial<React.ComponentProps<typeof V2BaseEmailHtml>>
) => {
  const image = `${WEBAPP_URL}/emails/logo.png`;

  return (
    <V2BaseEmailHtml
      subject={props.language("meeting_summary_email_subject", {
        title: props.title,
      })}>
      <div style={{ width: "89px", marginBottom: "35px" }}>
        <a href={WEBAPP_URL} target="_blank" rel="noreferrer">
          <img
            height="19"
            src={image}
            style={{
              border: "0",
              display: "block",
              outline: "none",
              textDecoration: "none",
              height: "19px",
              width: "100%",
              fontSize: "13px",
            }}
            width="89"
            alt=""
          />
        </a>
      </div>

      <p
        style={{
          fontSize: "32px",
          fontWeight: "600",
          lineHeight: "38.5px",
          marginBottom: "40px",
          color: "black",
        }}>
        <>{props.language("meeting_summary_heading")}</>
      </p>

      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        <>{props.language("hi_user_name", { name: props.name })},</>
      </p>

      <div
        style={{
          backgroundColor: "#F3F4F6",
          padding: "32px",
          marginBottom: "24px",
        }}>
        <p
          style={{
            fontSize: "18px",
            lineHeight: "20px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "black",
          }}>
          <>{props.title}</>
        </p>
        <p
          style={{
            fontWeight: 400,
            lineHeight: "24px",
            marginBottom: "24px",
            marginTop: "0px",
            color: "#6B7280",
          }}>
          {props.date}
        </p>
        {/* Render the Gemini-generated summary preserving newlines */}
        {props.summary.split("\n").map((line, i) => (
          <p
            key={i}
            style={{
              fontWeight: 400,
              lineHeight: "24px",
              marginBottom: "4px",
              marginTop: "0px",
              color: "black",
              whiteSpace: "pre-wrap",
            }}>
            {line || "\u00A0"}
          </p>
        ))}
      </div>

      {/* Disclaimer */}
      <p
        style={{
          fontWeight: 400,
          lineHeight: "20px",
          fontSize: "12px",
          color: "#9CA3AF",
          marginBottom: "32px",
        }}>
        <>{props.language("meeting_summary_disclaimer")}</>
      </p>

      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "32px", marginBottom: "8px" }}>
        <>{props.language("happy_scheduling")},</>
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "0px" }}>
        <>{props.language("the_calcom_team", { companyName: COMPANY_NAME })}</>
      </p>
    </V2BaseEmailHtml>
  );
};
