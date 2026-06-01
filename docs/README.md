# VETA API Documentation

This directory contains API documentation for the Virtual Equities Trading Application (VETA).

## API Endpoints

The main API documentation is available in [api-endpoints.md](api-endpoints.md), which lists all available endpoints grouped by service.

## How to Generate Documentation

The documentation is automatically generated using a script that parses the gateway routes:

```bash
# Run the documentation generator
deno run --allow-read --allow-write backend/scripts/generate-api-docs.ts
```

## Services

The VETA system consists of multiple services, each with their own set of endpoints:

- **User Service**: User management and authentication
- **Analytics Service**: Financial analytics and reporting
- **Market Data Service**: Market data feeds and references
- **Feature Engine**: Feature flag management
- **Signal Engine**: Trading signals and alerts
- **Recommendation Engine**: Investment recommendations
- **Scenario Engine**: Scenario analysis and backtesting
- **LLM Advisory Service**: AI-powered advisory services
- **EMS (Execution Management System)**: Order execution management
- **OMS (Order Management System)**: Order management
- **Journal Service**: Trading journal and history
- **Market Simulator**: Market simulation capabilities
- **FIX Archive**: FIX protocol message archive
- **FIX Gateway**: FIX protocol gateway
- **Kafka Relay**: Kafka message relay
- **News Aggregator**: News and information aggregation
- **Dark Pool**: Dark pool trading functionality
- **CCP Service**: Central Counterparty service
- **RFQ Service**: Request for Quote service
- **Product Service**: Product and instrument information
- **Replay Service**: Historical data replay
- **Risk Engine**: Risk management and analysis

## Authentication

Endpoints marked with ✅ require authentication, while those marked with ❌ do not.

## Contributing

To update the API documentation:

1. Make changes to the gateway route files in `backend/src/gateway/routes/`
2. Run the documentation generator script
3. Commit the updated documentation
