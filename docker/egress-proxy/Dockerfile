FROM alpine:3.22

RUN apk add --no-cache squid socat curl

COPY docker/egress-proxy/squid.conf /etc/squid/squid.conf
COPY docker/egress-proxy/allowlist.txt /etc/squid/allowlist.txt
COPY docker/egress-proxy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh \
  && mkdir -p /var/cache/squid /var/log/squid /run/squid \
  && touch /var/log/squid/access.log /var/log/squid/cache.log \
  && chown -R squid:squid /var/cache/squid /var/log/squid /run/squid \
  && chmod 0644 /var/log/squid/access.log /var/log/squid/cache.log

ENV NTP_UPSTREAM=pool.ntp.org

EXPOSE 3128/tcp 123/udp

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD curl -s -x http://127.0.0.1:3128 -o /dev/null -w '%{http_code}' http://egress-proxy.invalid/ | grep -q 403

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
