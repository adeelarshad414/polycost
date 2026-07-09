FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_HOST=0.0.0.0
ENV POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PORT=61780
ENV POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_ARTIFACT_DIR=/data/notary-receipts

COPY scripts/invoice-evidence-notary-reference-receiver.mjs scripts/invoice-evidence-notary-reference-receiver.mjs

RUN mkdir -p /data/notary-receipts && chown -R node:node /data/notary-receipts /app

USER node
EXPOSE 61780
VOLUME ["/data/notary-receipts"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.POLYCOST_INVOICE_EVIDENCE_NOTARY_RECEIVER_PORT || '61780') + '/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "scripts/invoice-evidence-notary-reference-receiver.mjs"]
