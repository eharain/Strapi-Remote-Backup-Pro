namespace StrapiBackup.Sidecar;

/// <summary>
/// Finds the engine and the Node runtime to run it with.
/// </summary>
/// <remarks>
/// Search order:
/// <list type="number">
///   <item>the bundled runtime shipped beside the app — what end users get</item>
///   <item><c>STRAPIBACKUP_CORE</c>, for developers pointing at a working tree</item>
///   <item>a global <c>strapi-backup</c> on PATH, as a last resort</item>
/// </list>
/// <para>
/// The bundled runtime comes first deliberately. Falling back to a machine-wide
/// Node would silently run the engine on whatever version happens to be installed,
/// producing bug reports that cannot be reproduced.
/// </para>
/// <para>
/// The located engine's version is checked against this app's expected version at
/// startup; a mismatch is refused rather than tolerated, because the two sides
/// share generated contracts and a skew shows up as malformed JSON deep inside a
/// backup run.
/// </para>
/// </remarks>
public static class CoreLocator
{
    public static string ResolveEnginePath() => throw new NotImplementedException();
}
