namespace StrapiBackup.Shared;

/// <summary>
/// Where the app keeps profiles, logs, and its default backup folder.
/// </summary>
/// <remarks>
/// Per-user application data on every platform, never the install directory —
/// the service and the interactive app must resolve the same paths for the same
/// user, or a schedule created in the UI silently fails to run.
/// </remarks>
public static class AppPaths
{
    public static string ConfigDirectory => throw new NotImplementedException();
    public static string LogDirectory => throw new NotImplementedException();
    public static string DefaultBackupDirectory => throw new NotImplementedException();
}
