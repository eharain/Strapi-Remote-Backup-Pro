using System.Reflection;

namespace StrapiBackup.Shared;

/// <summary>
/// Product identity and attribution for the desktop side.
/// </summary>
/// <remarks>
/// Every value is read from assembly metadata, which is set once in
/// <c>Directory.Build.props</c>. Nothing here is a literal, so the About screen,
/// the installer, and the executable's file properties cannot drift apart — and
/// the MIT copyright notice that must travel with every copy has exactly one
/// definition.
///
/// The engine has an equivalent in <c>apps/core/src/branding.ts</c>. The two are
/// kept in step by the version check the supervisor performs at startup, which
/// refuses a mismatched pair rather than running them together.
/// </remarks>
public static class ProductInfo
{
    private static readonly Assembly Self = typeof(ProductInfo).Assembly;

    public static string Name =>
        Self.GetCustomAttribute<AssemblyProductAttribute>()?.Product ?? "Strapi Remote Backup Pro";

    public static string Version =>
        Self.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";

    public static string Author =>
        Self.GetCustomAttribute<AssemblyMetadataAttribute>() is { Key: "Authors" } a ? a.Value ?? "" : "Ejaz Hussain Arain";

    public static string Company =>
        Self.GetCustomAttribute<AssemblyCompanyAttribute>()?.Company ?? "Tech Style Ltd";

    public static string Copyright =>
        Self.GetCustomAttribute<AssemblyCopyrightAttribute>()?.Copyright ?? "";

    public const string CompanyUrl = "https://tech-style.co/";
    public const string Registration = "Registered in England & Wales · Company No. 11101491";

    /// <summary>
    /// Stated plainly because this tool drives Strapi's admin API from outside
    /// without a plugin installed, and the relationship should not be left to
    /// inference.
    /// </summary>
    public const string TrademarkNotice =
        "Strapi is a trademark of Strapi Solutions SAS. This product is an independent tool " +
        "and is not affiliated with, endorsed by, or sponsored by Strapi Solutions SAS.";
}
