namespace StrapiBackup.App.ViewModels;

/// <summary>
/// The content-type tree and depth control.
/// </summary>
/// <remarks>
/// Depth changes re-plan against the engine rather than being computed here. The
/// relation graph lives in one place — duplicating that traversal in C# is exactly
/// the drift the generated-contracts rule exists to prevent.
/// </remarks>
public sealed class SelectionViewModel : ViewModelBase;
