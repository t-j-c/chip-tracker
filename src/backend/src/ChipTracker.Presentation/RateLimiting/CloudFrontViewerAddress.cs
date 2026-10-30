using System.Net;

namespace ChipTracker.Presentation.RateLimiting;

public static class CloudFrontViewerAddress
{
    public const string HeaderName = "CloudFront-Viewer-Address";

    /// <summary>Parses "ip:port" (IPv4, "[ipv6]:port" or bare IPv6; split on the last ':').</summary>
    public static IPAddress? Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        var text = value.Trim();

        if (IPAddress.TryParse(text, out var bare) && !(text.Contains('.') && text.Contains(':')))
            return bare;

        var idx = text.LastIndexOf(':');
        if (idx <= 0)
            return null;
        var host = text[..idx].Trim('[', ']');
        return IPAddress.TryParse(host, out var ip) ? ip : null;
    }
}

/// <summary>Replaces the connection's remote IP with the real viewer IP supplied by CloudFront.</summary>
public class CloudFrontViewerAddressMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        var ip = CloudFrontViewerAddress.Parse(context.Request.Headers[CloudFrontViewerAddress.HeaderName].ToString());
        if (ip != null)
            context.Connection.RemoteIpAddress = ip;
        return next(context);
    }
}
