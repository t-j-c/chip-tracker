# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app

# Copy solution and projects
COPY . .

# Restore and build
RUN dotnet restore "ChipTracker.sln"
RUN dotnet build "ChipTracker.sln" -c Release --no-restore

# Publish
RUN dotnet publish "src/ChipTracker.Presentation/ChipTracker.Presentation.csproj" \
    -c Release \
    -o /app/publish \
    --no-build

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app

# Copy published app from build stage
COPY --from=build /app/publish .

# Expose port
EXPOSE 5000
EXPOSE 5001

# Set ASP.NET Core environment
ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Run application
ENTRYPOINT ["dotnet", "ChipTracker.Presentation.dll"]
