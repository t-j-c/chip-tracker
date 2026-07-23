using ChipTracker.Application;
using ChipTracker.Application.Interfaces;
using ChipTracker.Infrastructure;
using ChipTracker.Presentation.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IGameNotifier, SignalRGameNotifier>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseCors("AllowAll");

// Health check
app.MapGet("/health", () => "OK");

app.Run();
