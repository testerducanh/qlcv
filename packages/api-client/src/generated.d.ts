export interface paths {
  "/health/live": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["HealthController_live"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/health": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["HealthController_health"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/auth/login": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Đăng nhập và cấp access token */
    post: operations["AuthController_login"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/auth/refresh": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Xoay vòng refresh token */
    post: operations["AuthController_refresh"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/auth/logout": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Đăng xuất và thu hồi refresh token */
    post: operations["AuthController_logout"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/auth/password/forgot": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["AuthController_forgotPassword"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/auth/password/reset": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["AuthController_resetPassword"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/auth/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Lấy thông tin người dùng hiện tại */
    get: operations["AuthController_me"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/auth/password": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations["AuthController_changePassword"];
    trace?: never;
  };
  "/projects/{projectId}/attachments/upload-url": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Tạo URL tải tệp lên có thời hạn */
    post: operations["AttachmentsController_createUpload"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/attachments/{attachmentId}/confirm": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Xác minh nội dung tệp vừa tải lên */
    post: operations["AttachmentsController_confirmUpload"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/attachments": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["AttachmentsController_library"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/attachments/trash": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["AttachmentsController_trash"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/attachments/{attachmentId}/history": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["AttachmentsController_history"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/attachments/{attachmentId}/download": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Tạo URL tải tệp xuống có kiểm tra quyền */
    get: operations["AttachmentsController_download"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/attachments/{attachmentId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["AttachmentsController_softDelete"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/attachments/{attachmentId}/restore": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["AttachmentsController_restore"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/branches": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê chi nhánh trong phạm vi quản trị */
    get: operations["BranchesController_list"];
    put?: never;
    /** Tạo chi nhánh */
    post: operations["BranchesController_create"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/branches/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["BranchesController_deactivate"];
    options?: never;
    head?: never;
    patch: operations["BranchesController_update"];
    trace?: never;
  };
  "/branches/available": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê chi nhánh trong phạm vi tạo dự án */
    get: operations["AvailableBranchesController_list"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/departments": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["DepartmentsController_list"];
    put?: never;
    post: operations["DepartmentsController_create"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/departments/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["DepartmentsController_deactivate"];
    options?: never;
    head?: never;
    patch: operations["DepartmentsController_update"];
    trace?: never;
  };
  "/users": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê người dùng trong tổ chức */
    get: operations["UsersController_list"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/users/invite": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["UsersController_invite"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/users/{id}/role": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations["UsersController_changeRole"];
    trace?: never;
  };
  "/users/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["UsersController_disable"];
    options?: never;
    head?: never;
    patch: operations["UsersController_update"];
    trace?: never;
  };
  "/invitations/accept": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["InvitationsController_accept"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["ProjectsController_list"];
    put?: never;
    /** Tạo dự án mới */
    post: operations["ProjectsController_create"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["ProjectsController_get"];
    put?: never;
    post?: never;
    delete: operations["ProjectsController_delete"];
    options?: never;
    head?: never;
    patch: operations["ProjectsController_update"];
    trace?: never;
  };
  "/projects/{id}/available-members": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê thành viên có thể thêm vào dự án */
    get: operations["ProjectsController_availableMembers"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{id}/archive": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["ProjectsController_archive"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{id}/clone": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["ProjectsController_clone"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{id}/members": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["ProjectsController_listMembers"];
    put?: never;
    post: operations["ProjectsController_addMember"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{id}/members/{userId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["ProjectsController_removeMember"];
    options?: never;
    head?: never;
    patch: operations["ProjectsController_updateMember"];
    trace?: never;
  };
  "/me/tasks": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["MyWorkController_tasks"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/me/tasks/search": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["MyWorkController_search"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/me/saved-views": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["MyWorkController_savedViews"];
    put?: never;
    post: operations["MyWorkController_createSavedView"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/me/saved-views/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["MyWorkController_deleteSavedView"];
    options?: never;
    head?: never;
    patch: operations["MyWorkController_updateSavedView"];
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/comments": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê nhận xét của việc */
    get: operations["P16Controller_comments"];
    put?: never;
    /** Tạo nhận xét và nhắc thành viên */
    post: operations["P16Controller_createComment"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/comments/{commentId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations["P16Controller_editComment"];
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/comments/{commentId}/hide": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["P16Controller_hideComment"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/notifications": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê thông báo của người dùng hiện tại */
    get: operations["P16Controller_notifications"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/notifications/{notificationId}/read": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["P16Controller_readNotification"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/notifications/read-all": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["P16Controller_readAllNotifications"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/activity": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["P16Controller_taskActivity"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/activity": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["P16Controller_projectActivity"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/trash": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê nội dung trong thùng rác dự án */
    get: operations["P16Controller_trash"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/trash/projects": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["P16Controller_projectTrash"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/trash/projects/{projectId}/restore": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["P16Controller_restoreProject"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/trash/projects/{projectId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["P16Controller_permanentlyDeleteProject"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["P16Controller_softDeleteProject"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/trash/{entityType}/{entityId}/restore": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["P16Controller_restore"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/trash/{entityType}/{entityId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["P16Controller_permanentlyDelete"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liệt kê việc trong dự án */
    get: operations["TasksController_list"];
    put?: never;
    /** Tạo việc hoặc nhóm việc trong dự án */
    post: operations["TasksController_create"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/paste": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["TasksController_paste"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/bulk": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["TasksController_bulkUpdate"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/bulk/undo": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Hoàn tác cập nhật hàng loạt trong thời hạn cho phép */
    post: operations["TasksController_undoBulkUpdate"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["TasksController_get"];
    put?: never;
    post?: never;
    delete: operations["TasksController_delete"];
    options?: never;
    head?: never;
    patch: operations["TasksController_update"];
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/assignment-transition": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Chuyển trạng thái giao việc theo mức dự án */
    post: operations["TasksController_transitionAssignment"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/move": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["TasksController_move"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/clone": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["TasksController_clone"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/checklist": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["TasksController_checklist"];
    put?: never;
    post: operations["TasksController_addChecklistItem"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/checklist/{itemId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["TasksController_deleteChecklistItem"];
    options?: never;
    head?: never;
    patch: operations["TasksController_updateChecklistItem"];
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/checklist/{itemId}/move": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["TasksController_moveChecklistItem"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/checklist/{itemId}/convert-to-task": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["TasksController_convertChecklistItem"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/children/{childTaskId}/convert-to-checklist": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["TasksController_convertTask"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/dependencies": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["TasksController_dependencies"];
    put?: never;
    post: operations["TasksController_addDependency"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/projects/{projectId}/tasks/{taskId}/dependencies/{dependencyId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["TasksController_deleteDependency"];
    options?: never;
    head?: never;
    patch: operations["TasksController_updateDependency"];
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: never;
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  HealthController_live: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HealthController_health: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AuthController_login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: email */
          email: string;
          password: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AuthController_refresh: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AuthController_logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AuthController_forgotPassword: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: email */
          email: string;
        };
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AuthController_resetPassword: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          token: string;
          newPassword: string;
        };
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AuthController_me: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AuthController_changePassword: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          currentPassword: string;
          newPassword: string;
        };
      };
    };
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_createUpload: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uuid */
          taskId?: string;
          /** Format: uuid */
          checklistItemId?: string;
          /** Format: uuid */
          commentId?: string;
          fileName: string;
          mime: string;
          size: number;
          note?: string;
          /** Format: date-time */
          takenAt?: string;
          lat?: number;
          lng?: number;
          /** Format: uuid */
          versionGroupId?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_confirmUpload: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_library: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_trash: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_history: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_download: {
    parameters: {
      query: {
        variant: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_softDelete: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AttachmentsController_restore: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  BranchesController_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  BranchesController_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          name: string;
          code?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  BranchesController_deactivate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  BranchesController_update: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  AvailableBranchesController_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  DepartmentsController_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  DepartmentsController_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          name: string;
          /** Format: uuid */
          branchId?: string | null;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  DepartmentsController_deactivate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  DepartmentsController_update: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  UsersController_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  UsersController_invite: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: email */
          email: string;
          name: string;
          /** @enum {string} */
          systemRole?:
            | "system_admin"
            | "executive"
            | "branch_director"
            | "department_head"
            | "member";
          /** Format: uuid */
          branchId?: string | null;
          /** Format: uuid */
          departmentId?: string | null;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  UsersController_changeRole: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  UsersController_disable: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  UsersController_update: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  InvitationsController_accept: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          token: string;
          password: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_list: {
    parameters: {
      query?: {
        order?: "asc" | "desc";
        sort?: "name" | "createdAt" | "dueDate";
        mine?: "true" | "false";
        search?: string;
        status?: "active" | "on_hold" | "completed" | "archived";
        branchId?: string;
        pageSize?: number;
        page?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uuid */
          branchId: string;
          name: string;
          description?: string;
          /** Format: date */
          startDate?: string;
          /** Format: date */
          dueDate?: string;
          /** @enum {string} */
          progressMode?: "by_count" | "by_workdays" | "manual";
          /** @enum {string} */
          confidentiality?: "normal" | "restricted";
          /** @enum {string} */
          assignmentLevel?: "light" | "standard" | "strict";
          /** @enum {string} */
          strictEvidenceRequirement?: "attachment" | "note" | "either";
          workCalendar?: {
            weeklyOff?: number[];
            holidays?: string[];
          };
          statusLabels?: {
            [key: string]: string;
          };
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_delete: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_update: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_availableMembers: {
    parameters: {
      query?: {
        search?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_archive: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_clone: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          name?: string;
          /** @default false */
          includeMembers?: boolean;
          /** @default false */
          includeFiles?: boolean;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_listMembers: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_addMember: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uuid */
          userId: string;
          /**
           * @default member
           * @enum {string}
           */
          role?:
            | "owner"
            | "manager"
            | "member"
            | "restricted"
            | "commenter"
            | "viewer";
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_removeMember: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  ProjectsController_updateMember: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** @enum {string} */
          role:
            | "owner"
            | "manager"
            | "member"
            | "restricted"
            | "commenter"
            | "viewer";
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  MyWorkController_tasks: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  MyWorkController_search: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  MyWorkController_savedViews: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  MyWorkController_createSavedView: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          name: string;
          filter?: Record<string, never>;
          /** @enum {string} */
          viewMode?: "list" | "kanban" | "timeline" | "calendar";
          /** Format: uuid */
          projectId?: string;
          /** @default false */
          isShared?: boolean;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  MyWorkController_deleteSavedView: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  MyWorkController_updateSavedView: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_comments: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_createComment: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_editComment: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_hideComment: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_notifications: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_readNotification: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        notificationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_readAllNotifications: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_taskActivity: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_projectActivity: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_trash: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_projectTrash: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_restoreProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_permanentlyDeleteProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_softDeleteProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_restore: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  P16Controller_permanentlyDelete: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          title: string;
          /** Format: uuid */
          parentId?: string | null;
          /** @enum {string} */
          type?: "group" | "task" | "milestone";
          description?: string | null;
          /** @enum {string} */
          priority?: "urgent" | "high" | "normal" | "low";
          /** Format: date */
          startDate?: string | null;
          durationDays?: number | null;
          /** Format: date */
          dueDate?: string | null;
          /** Format: uuid */
          assigneeId?: string | null;
          /** @enum {string} */
          assignmentLevel?: "light" | "standard" | "strict";
          /** Format: uuid */
          reviewerId?: string | null;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_paste: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          text: string;
          /** @default false */
          preview?: boolean;
          /** Format: uuid */
          parentId?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_bulkUpdate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          taskIds: string[];
          /** Format: uuid */
          assigneeId?: string | null;
          /** Format: date */
          dueDate?: string | null;
          /** @enum {string} */
          status?: "todo" | "doing" | "done" | "blocked";
          blockedReason?: string;
          labelIds?: string[];
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_undoBulkUpdate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uuid */
          undoToken: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_delete: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_update: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          version: number;
          title?: string;
          description?: string | null;
          /** @enum {string} */
          type?: "group" | "task" | "milestone";
          /** @enum {string} */
          status?: "todo" | "doing" | "done" | "blocked";
          blockedReason?: string | null;
          /** @enum {string} */
          priority?: "urgent" | "high" | "normal" | "low";
          /** Format: date */
          startDate?: string | null;
          durationDays?: number | null;
          /** Format: date */
          dueDate?: string | null;
          /** Format: uuid */
          assigneeId?: string | null;
          /** @enum {string|null} */
          assignmentLevel?: "light" | "standard" | "strict" | null;
          /** Format: uuid */
          reviewerId?: string | null;
          progress?: number;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_transitionAssignment: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          version: number;
          /** @enum {string} */
          action:
            | "assign"
            | "reassign"
            | "accept"
            | "reject"
            | "propose_adjustment"
            | "start"
            | "submit"
            | "approve"
            | "return"
            | "pause"
            | "resume";
          reason?: string;
          evidenceNote?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_move: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          version: number;
          /** Format: uuid */
          parentId: string | null;
          /** Format: uuid */
          beforeTaskId?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_clone: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** @default false */
          includeFiles?: boolean;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_checklist: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_addChecklistItem: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          title: string;
          /** Format: uuid */
          assigneeId?: string | null;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_deleteChecklistItem: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_updateChecklistItem: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          title?: string;
          done?: boolean;
          /** Format: uuid */
          assigneeId?: string | null;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_moveChecklistItem: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uuid */
          beforeItemId?: string;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_convertChecklistItem: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_convertTask: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_dependencies: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_addDependency: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** Format: uuid */
          predecessorId: string;
          /** @enum {string} */
          type?: "finish_start" | "overlap" | "blocking_finish";
          lagDays?: number;
          /** @default false */
          autoReschedule?: boolean;
        };
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_deleteDependency: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  TasksController_updateDependency: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          /** @enum {string} */
          type?: "finish_start" | "overlap" | "blocking_finish";
          lagDays?: number;
        };
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
}
