import React, { useState } from 'react';
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  FolderKanban,
} from 'lucide-react';
import { Category, CreateCategoryInput, UpdateCategoryInput } from '../types';
import {
  getCategoryIcon,
  POPULAR_CATEGORY_ICONS,
  PRESET_CATEGORY_COLORS,
} from '../utils/formatters';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onCreateCategory: (input: CreateCategoryInput) => Promise<void>;
  onUpdateCategory: (id: number, input: UpdateCategoryInput) => Promise<void>;
  onDeleteCategory: (id: number) => Promise<void>;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  // New Category State
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_CATEGORY_COLORS[0]);
  const [newIcon, setNewIcon] = useState('wallet');
  const [isCreating, setIsCreating] = useState(false);

  // Edit Category State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Deleting State
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Error Alert State
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newName.trim()) {
      setError('Please provide a category name');
      return;
    }

    setIsCreating(true);
    try {
      await onCreateCategory({
        name: newName.trim(),
        color: newColor,
        icon: newIcon,
      });
      setNewName('');
      setNewColor(PRESET_CATEGORY_COLORS[0]);
      setNewIcon('wallet');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create category');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color || PRESET_CATEGORY_COLORS[0]);
    setEditIcon(cat.icon || 'wallet');
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
    setEditIcon('');
  };

  const handleSaveEdit = async (id: number) => {
    setError(null);
    if (!editName.trim()) {
      setError('Category name cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    try {
      await onUpdateCategory(id, {
        name: editName.trim(),
        color: editColor,
        icon: editIcon,
      });
      cancelEdit();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update category');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    const debtCount = cat.debt_count ?? cat.debtCount ?? 0;
    if (debtCount > 0) {
      setError(`Cannot delete "${cat.name}" because it has ${debtCount} active debt(s) attached.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete the category "${cat.name}"?`)) {
      return;
    }

    setDeletingId(cat.id);
    setError(null);
    try {
      await onDeleteCategory(cat.id);
      if (editingId === cat.id) {
        cancelEdit();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to delete category');
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Manage Categories</h3>
              <p className="text-xs text-gray-500">
                Organize debts into customizable groups with colors and icons
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="rounded-xl bg-red-50 p-3.5 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Add New Category Form */}
          <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/80">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>Create New Category</span>
            </h4>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Student Loans, Personal Loans"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                />
              </div>

              {/* Color Presets */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Color Theme
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        newColor === color
                          ? 'scale-125 ring-2 ring-offset-2 ring-gray-400'
                          : 'hover:scale-110 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-7 h-7 p-0 border-0 rounded-full cursor-pointer overflow-hidden bg-transparent"
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Icon Presets */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Icon
                </label>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {POPULAR_CATEGORY_ICONS.map((item) => {
                    const IconComp = item.icon;
                    const isSelected = newIcon === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setNewIcon(item.name)}
                        title={item.label}
                        className={`p-2 rounded-xl flex items-center justify-center transition ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs shadow-blue-500/20 transition disabled:opacity-60"
                >
                  {isCreating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Add Category</span>
                </button>
              </div>
            </form>
          </div>

          {/* 2. Existing Categories List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Existing Categories ({categories.length})
            </h4>

            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
              {categories.map((cat) => {
                const isEditing = editingId === cat.id;
                const isDeleting = deletingId === cat.id;
                const IconComponent = getCategoryIcon(isEditing ? editIcon : cat.icon);
                const debtCount = cat.debt_count ?? cat.debtCount ?? 0;

                if (isEditing) {
                  return (
                    <div key={cat.id} className="p-4 bg-blue-50/40 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                      </div>

                      {/* Color presets during edit */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {PRESET_CATEGORY_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setEditColor(color)}
                            className={`w-5 h-5 rounded-full transition ${
                              editColor === color
                                ? 'scale-125 ring-2 ring-offset-2 ring-gray-400'
                                : 'opacity-70 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>

                      {/* Icon presets during edit */}
                      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                        {POPULAR_CATEGORY_ICONS.map((item) => {
                          const IconComp = item.icon;
                          const isSelected = editIcon === item.name;
                          return (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => setEditIcon(item.name)}
                              title={item.label}
                              className={`p-1.5 rounded-lg flex items-center justify-center transition ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              <IconComp className="w-3.5 h-3.5" />
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-3 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSavingEdit}
                          onClick={() => handleSaveEdit(cat.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                        >
                          {isSavingEdit ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={cat.id}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="p-2 rounded-xl text-white shadow-xs flex-shrink-0"
                        style={{ backgroundColor: cat.color || '#3B82F6' }}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-800 truncate">
                          {cat.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {debtCount} {debtCount === 1 ? 'debt' : 'debts'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(cat)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Edit Category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting || debtCount > 0}
                        onClick={() => handleDelete(cat)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          debtCount > 0
                            ? 'Cannot delete category with active debts'
                            : 'Delete Category'
                        }
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end flex-shrink-0 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryModal;
