# Redpanda binaries — copied into the dev container so services can publish/consume
FROM redpandadata/redpanda:v24.3.6 AS redpanda-src

# Use Ubuntu as base image
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    fish \
    git \
    python3 \
    python3-pip \
    sqlite3 \
    shellcheck \
    ruby \
    tree \
    ssh \
    sudo \
    supervisor \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxss1 \
    libxcomposite1 \
    libxrandr2 \
    libgtk-3-0 \
    libxcb1 \
    libx11-xcb1 \
    && gem install lolcat \
    && pip3 install --no-cache-dir --upgrade "git+https://github.com/openai/whisper.git@v20231117" \
    && pip install --no-cache-dir --upgrade yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 LTS (for frontend tooling & Playwright)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* || true

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/* || true

# Copy Redpanda runtime assets and place real executables on PATH.
# This avoids relying on wrapper scripts that hard-code /opt/redpanda paths.
COPY --from=redpanda-src /opt/redpanda/lib /usr/local/lib/redpanda
COPY --from=redpanda-src /opt/redpanda/libexec/redpanda /usr/local/bin/redpanda
COPY --from=redpanda-src /opt/redpanda/libexec/rpk /usr/local/bin/rpk
RUN chmod +x /usr/local/bin/redpanda /usr/local/bin/rpk && \
    mkdir -p /var/lib/redpanda/data /etc/redpanda
# Do NOT set LD_LIBRARY_PATH globally — Redpanda ships its own libc.so.6 which
# breaks any shell that loads it at startup. Set it only for the redpanda
# process at runtime (see supervisord.conf [program:redpanda] environment=).

# Create the 'deno' user with Fish as default shell
RUN useradd -m -s /usr/bin/fish deno && \
    chown -R deno:deno /var/lib/redpanda /etc/redpanda

# Ensure the .ssh directory exists and has the correct permissions
RUN mkdir -p /home/deno/.ssh && \
    chown -R deno:deno /home/deno/.ssh && \
    chmod 700 /home/deno/.ssh

# Switch to the 'deno' user
USER deno

# Set the working directory
WORKDIR /home/deno

# Ensure the Fish configuration directory exists
RUN mkdir -p /home/deno/.config/fish

# Install Deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

# Install Fly.io CLI (as deno user, installs to ~/.fly)
RUN curl -L https://fly.io/install.sh | sh

# Copy the supervisord configuration
COPY supervisord.conf /home/deno/supervisord.conf

# Copy Fish shell config (banner + aliases) — source of truth is .devcontainer/config.fish
COPY .devcontainer/config.fish /home/deno/.config/fish/config.fish

# Ensure supervisord runs
CMD ["/usr/bin/supervisord", "-c", "/home/deno/supervisord.conf"]

# Set Fish as the default shell
SHELL ["/usr/bin/fish", "-c"]
