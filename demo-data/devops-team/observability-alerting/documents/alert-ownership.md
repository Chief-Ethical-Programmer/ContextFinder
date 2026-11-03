# Signal Watch — synthetic alert handover

**Project:** Observability and Alerting  
**Departing maintainer:** Alex  
**Incoming maintainer:** Ryan  
**Reviewer:** Priya

The README describes a checkout latency page at p95 above 500 ms for five minutes. The Slack export describes a draft threshold of 700 ms for three minutes. The corresponding merged alert-rule commit is not in this pack, so the active threshold is not established.

Ownership is also unclear. The README implies Platform takes first response, while the channel topic points to an SRE rotation. Alex can investigate cluster saturation but does not know who acknowledges overnight checkout pages.

The on-call escalation matrix is missing. Ask for an approved synthetic mapping and a representative alert record before publishing an owner or escalation claim. No real pager schedule or contact details are included.
